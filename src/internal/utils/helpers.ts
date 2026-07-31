import type { UserAgentData } from '../../types'
import { PlatformClassifier } from './types'

type BrowserGlobal = typeof globalThis & {
	document?: Document
	WorkerGlobalScope?: unknown
}

const browserGlobal = globalThis as BrowserGlobal
export const IS_WORKER_SCOPE = !('document' in browserGlobal) && 'WorkerGlobalScope' in browserGlobal

function readStringProperty(value: unknown, property: PropertyKey): string | undefined {
	try {
		if (value == null || (typeof value != 'object' && typeof value != 'function')) return undefined
		const result = Reflect.get(value, property)
		return typeof result == 'string' ? result : undefined
	} catch {
		return undefined
	}
}

// Detect Browser
function getEngine(): number | undefined {
	const x = [].constructor
	try {
		(-1).toFixed(-1)
	} catch (err) {
		const message = readStringProperty(err, 'message')
		const name = readStringProperty(x, 'name')
		if (message === undefined || name === undefined) return undefined
		try {
			return message.length + String(x).split(name).join('').length
		} catch {
			return undefined
		}
	}
	return undefined
}

const ENGINE_IDENTIFIER = getEngine()
const IS_BLINK = ENGINE_IDENTIFIER == 80
const IS_GECKO = ENGINE_IDENTIFIER == 58
const IS_WEBKIT = ENGINE_IDENTIFIER == 77
const ENGINE_NAMES: Readonly<Record<number, string>> = {
	80: 'V8',
	58: 'SpiderMonkey',
	77: 'JavaScriptCore',
}
const JS_ENGINE = ENGINE_IDENTIFIER === undefined ? null : ENGINE_NAMES[ENGINE_IDENTIFIER] ?? null

const LIKE_BRAVE = IS_BLINK && 'flat' in Array.prototype /* Chrome 69 */ && !('ReportingObserver' in browserGlobal /* Brave */)

const LIKE_BRAVE_RESISTANCE = (() => {
	try {
		return LIKE_BRAVE && Reflect.get(navigator, 'keyboard') === null
	} catch {
		return false
	}
})()

function braveBrowser(): boolean {
	try {
		const brave = Reflect.get(navigator, 'brave')
		if (brave == null || (typeof brave != 'object' && typeof brave != 'function')) return false
		const isBrave = Reflect.get(brave, 'isBrave')
		const constructor = Reflect.get(Object.getPrototypeOf(brave), 'constructor')
		return readStringProperty(constructor, 'name') == 'Brave' && typeof isBrave == 'function' &&
			Function.prototype.toString.call(isBrave) == 'function isBrave() { [native code] }'
	} catch {
		return false
	}
}

function getBraveMode() {
	const mode = {
		unknown: false,
		allow: false,
		standard: false,
		strict: false,
	}
	try {
		// strict mode adds float frequency data AnalyserNode
		const strictMode = (): boolean => {
			type OfflineContextWithClose = OfflineAudioContext & { close?: () => Promise<void> | void }
			type OfflineContextConstructor = new (numberOfChannels: number, length: number, sampleRate: number) => OfflineContextWithClose
			const windowWithWebkit = window as typeof window & { webkitOfflineAudioContext?: OfflineContextConstructor }
			const OfflineContext = windowWithWebkit.OfflineAudioContext as OfflineContextConstructor | undefined ??
				windowWithWebkit.webkitOfflineAudioContext
			if (typeof OfflineContext != 'function') {
				return false
			}
			let context: OfflineContextWithClose | undefined
			let analyser: AnalyserNode | undefined
			try {
				context = new OfflineContext(1, 1, 44100)
				analyser = context.createAnalyser()
				const data = new Float32Array(analyser.frequencyBinCount)
				analyser.getFloatFrequencyData(data)
				return new Set(data).size > 1 // native only has -Infinity
			} finally {
				try {
					analyser?.disconnect()
				} catch {}
				try {
					void Promise.resolve(context?.close?.()).catch(() => undefined)
				} catch {}
			}
		}

		if (strictMode()) {
			mode.strict = true
			return mode
		}
		// standard and strict mode do not have chrome plugins
		const chromePlugins = /(Chrom(e|ium)|Microsoft Edge) PDF (Plugin|Viewer)/
		const pluginsList = [...navigator.plugins]
		const hasChromePlugins = pluginsList
			.filter((plugin) => chromePlugins.test(plugin.name)).length == 2
		if (pluginsList.length && !hasChromePlugins) {
			mode.standard = true
			return mode
		}
		mode.allow = true
		return mode
	} catch {
		mode.unknown = true
		return mode
	}
}

const getBraveUnprotectedParameters = <T>(parameters: Readonly<Record<string, T>>): Record<string, T> => {
	const blocked = new Set([
		'FRAGMENT_SHADER.HIGH_FLOAT.precision',
		'FRAGMENT_SHADER.HIGH_FLOAT.rangeMax',
		'FRAGMENT_SHADER.HIGH_FLOAT.rangeMin',
		'FRAGMENT_SHADER.HIGH_INT.precision',
		'FRAGMENT_SHADER.HIGH_INT.rangeMax',
		'FRAGMENT_SHADER.HIGH_INT.rangeMin',
		'FRAGMENT_SHADER.LOW_FLOAT.precision',
		'FRAGMENT_SHADER.LOW_FLOAT.rangeMax',
		'FRAGMENT_SHADER.LOW_FLOAT.rangeMin',
		'FRAGMENT_SHADER.MEDIUM_FLOAT.precision',
		'FRAGMENT_SHADER.MEDIUM_FLOAT.rangeMax',
		'FRAGMENT_SHADER.MEDIUM_FLOAT.rangeMin',
		'MAX_COMBINED_FRAGMENT_UNIFORM_COMPONENTS',
		'MAX_COMBINED_UNIFORM_BLOCKS',
		'MAX_COMBINED_VERTEX_UNIFORM_COMPONENTS',
		'MAX_DRAW_BUFFERS_WEBGL',
		'MAX_FRAGMENT_INPUT_COMPONENTS',
		'MAX_FRAGMENT_UNIFORM_BLOCKS',
		'MAX_FRAGMENT_UNIFORM_COMPONENTS',
		'MAX_TEXTURE_MAX_ANISOTROPY_EXT',
		'MAX_TRANSFORM_FEEDBACK_INTERLEAVED_COMPONENTS',
		'MAX_UNIFORM_BUFFER_BINDINGS',
		'MAX_VARYING_COMPONENTS',
		'MAX_VERTEX_OUTPUT_COMPONENTS',
		'MAX_VERTEX_UNIFORM_BLOCKS',
		'MAX_VERTEX_UNIFORM_COMPONENTS',
		'SHADING_LANGUAGE_VERSION',
		'UNMASKED_RENDERER_WEBGL',
		'UNMASKED_VENDOR_WEBGL',
		'VERSION',
		'VERTEX_SHADER.HIGH_FLOAT.precision',
		'VERTEX_SHADER.HIGH_FLOAT.rangeMax',
		'VERTEX_SHADER.HIGH_FLOAT.rangeMin',
		'VERTEX_SHADER.HIGH_INT.precision',
		'VERTEX_SHADER.HIGH_INT.rangeMax',
		'VERTEX_SHADER.HIGH_INT.rangeMin',
		'VERTEX_SHADER.LOW_FLOAT.precision',
		'VERTEX_SHADER.LOW_FLOAT.rangeMax',
		'VERTEX_SHADER.LOW_FLOAT.rangeMin',
		'VERTEX_SHADER.MEDIUM_FLOAT.precision',
		'VERTEX_SHADER.MEDIUM_FLOAT.rangeMax',
		'VERTEX_SHADER.MEDIUM_FLOAT.rangeMin',
	])
	const safeParameters: Record<string, T> = {}
	Object.entries(parameters).forEach(([key, value]) => {
		if (!blocked.has(key)) safeParameters[key] = value
	})
	return safeParameters
}


// system
const getOS = (userAgent: string): string => {
	const os = (
		// order is important
		/windows phone/ig.test(userAgent) ? 'Windows Phone' :
			/win(dows|16|32|64|95|98|nt)|wow64/ig.test(userAgent) ? 'Windows' :
				/android/ig.test(userAgent) ? 'Android' :
					/cros/ig.test(userAgent) ? 'Chrome OS' :
						/linux/ig.test(userAgent) ? 'Linux' :
							/ipad/ig.test(userAgent) ? 'iPad' :
								/iphone/ig.test(userAgent) ? 'iPhone' :
									/ipod/ig.test(userAgent) ? 'iPod' :
										/ios/ig.test(userAgent) ? 'iOS' :
											/mac/ig.test(userAgent) ? 'Mac' :
												'Other'
	)
	return os
}

function getReportedPlatform(userAgent: string, platform?: string): PlatformClassifier[] {
	// user agent os lie
		const userAgentOS = (
			// order is important
			/win(dows|16|32|64|95|98|nt)|wow64/ig.test(userAgent) ? PlatformClassifier.WINDOWS :
				/android|linux|cros/ig.test(userAgent) ? PlatformClassifier.LINUX :
					/(i(os|p(ad|hone|od)))|mac/ig.test(userAgent) ? PlatformClassifier.APPLE :
						PlatformClassifier.OTHER
		)

		if (!platform) return [userAgentOS]

		const platformOS = (
			// order is important
			/win/ig.test(platform) ? PlatformClassifier.WINDOWS :
				/android|arm|linux/ig.test(platform) ? PlatformClassifier.LINUX :
					/(i(os|p(ad|hone|od)))|mac/ig.test(platform) ? PlatformClassifier.APPLE :
						PlatformClassifier.OTHER
		)
		return [userAgentOS, platformOS]
}
const navUserAgent = globalThis.navigator?.userAgent || ''
const navPlatform = globalThis.navigator?.platform
const [USER_AGENT_OS, PLATFORM_OS] = getReportedPlatform(navUserAgent, navPlatform)

interface UserAgentDecryptionInput {
	ua: string
	os: string
	isBrave: boolean
}

const decryptUserAgent = ({ ua, os, isBrave }: UserAgentDecryptionInput): string => {
	const apple = /ipad|iphone|ipod|ios|mac/ig.test(os)
	const isOpera = /OPR\//i.test(ua)
	const isVivaldi = /Vivaldi/i.test(ua)
	const isDuckDuckGo = /DuckDuckGo/i.test(ua)
	const isYandex = /YaBrowser/i.test(ua)
	const paleMoon = ua.match(/(palemoon)\/(\d+)./i)
	const edge = ua.match(/(edgios|edg|edge|edga)\/(\d+)./i)
	const edgios = !!edge && /edgios/i.test(edge[1] ?? '')
	const chromium = ua.match(/(crios|chrome)\/(\d+)./i)
	const firefox = ua.match(/(fxios|firefox)\/(\d+)./i)
	const likeSafari = (
		/AppleWebKit/i.test(ua) &&
		/Safari/i.test(ua)
	)
	const safari = (
		likeSafari &&
		!firefox &&
		!chromium &&
		!edge &&
		ua.match(/(version)\/(\d+)\.(\d|\.)+\s(mobile|safari)/i)
	)

	if (chromium) {
		const browser = chromium[1]
		const version = chromium[2]
		const like = (
			isOpera ? ' Opera' :
				isVivaldi ? ' Vivaldi' :
					isDuckDuckGo ? ' DuckDuckGo' :
						isYandex ? ' Yandex' :
							edge ? ' Edge' :
								isBrave ? ' Brave' : ''
		)
		return `${browser} ${version}${like}`
	} else if (edgios) {
		const browser = edge[1]
		const version = edge[2]
		return `${browser} ${version}`
	} else if (firefox) {
		const browser = paleMoon ? paleMoon[1] : firefox[1]
		const version = paleMoon ? paleMoon[2] : firefox[2]
		return `${browser} ${version}`
	} else if (apple && safari) {
		const browser = 'Safari'
		const version = safari[2]
		return `${browser} ${version}`
	}
	return 'unknown'
}


interface UserAgentPlatformInput {
	userAgent?: string
	excludeBuild?: boolean
}

const getUserAgentPlatform = ({ userAgent, excludeBuild = true }: UserAgentPlatformInput): string => {
	if (!userAgent) {
		return 'unknown'
	}

	// patterns
	const nonPlatformParenthesis = /\((khtml|unlike|vizio|like gec|internal dummy|org\.eclipse|openssl|ipv6|via translate|safari|cardamon).+|xt\d+\)/ig
	const parenthesis = /\((.+)\)/
	const android = /((android).+)/i
	const androidNoise = /^(linux|[a-z]|wv|mobile|[a-z]{2}(-|_)[a-z]{2}|[a-z]{2})$|windows|(rv:|trident|webview|iemobile).+/i
	const androidBuild = /build\/.+\s|\sbuild\/.+/i
	const androidRelease = /android( |-)\d+/i
	const windows = /((windows).+)/i
	const windowsNoise = /^(windows|ms(-|)office|microsoft|compatible|[a-z]|x64|[a-z]{2}(-|_)[a-z]{2}|[a-z]{2})$|(rv:|outlook|ms(-|)office|microsoft|trident|\.net|msie|httrack|media center|infopath|aol|opera|iemobile|webbrowser).+/i
	const windows64bitCPU = /w(ow|in)64/i
	const cros = /cros/i
	const crosNoise = /^([a-z]|x11|[a-z]{2}(-|_)[a-z]{2}|[a-z]{2})$|(rv:|trident).+/i
	const crosBuild = /\d+\.\d+\.\d+/i
	const linux = /linux|x11|ubuntu|debian/i
	const linuxNoise = /^([a-z]|x11|unknown|compatible|[a-z]{2}(-|_)[a-z]{2}|[a-z]{2})$|(rv:|java|oracle|\+http|http|unknown|mozilla|konqueror|valve).+/i
	const apple = /(cpu iphone|cpu os|iphone os|mac os|macos|intel os|ppc mac).+/i
	const appleNoise = /^([a-z]|macintosh|compatible|mimic|[a-z]{2}(-|_)[a-z]{2}|[a-z]{2}|rv|\d+\.\d+)$|(rv:|silk|valve).+/i
	const appleRelease = /(ppc |intel |)(mac|mac |)os (x |x|)(\d{2}(_|\.)\d{1,2}|\d{2,})/i
	const otherOS = /((symbianos|nokia|blackberry|morphos|mac).+)|\/linux|freebsd|symbos|series \d+|win\d+|unix|hp-ux|bsdi|bsd|x86_64/i

	const isDevice = (list: readonly string[], device: RegExp) => list.filter((x) => device.test(x)).length

	userAgent = userAgent.trim().replace(/\s{2,}/, ' ').replace(nonPlatformParenthesis, '')

	const platformMatch = parenthesis.exec(userAgent)
	if (platformMatch) {
		const platformSection = platformMatch[0]
		const identifiers = platformSection.slice(1, -1).replace(/,/g, ';').split(';').map((x) => x.trim())

		if (isDevice(identifiers, android)) {
			return identifiers
				.map((x) => androidRelease.exec(x)?.[0].replace('-', ' ') ?? x)
				.filter((x) => !(androidNoise.test(x)))
				.join(' ')
				.replace((excludeBuild ? androidBuild : ''), '')
				.trim().replace(/\s{2,}/, ' ')
		} else if (isDevice(identifiers, windows)) {
			return identifiers
				.filter((x) => !(windowsNoise.test(x)))
				.join(' ')
				.replace(/\sNT (\d+\.\d+)/, (match, version) => {
					return (
						version == '10.0' ? ' 10' :
							version == '6.3' ? ' 8.1' :
								version == '6.2' ? ' 8' :
									version == '6.1' ? ' 7' :
										version == '6.0' ? ' Vista' :
											version == '5.2' ? ' XP Pro' :
												version == '5.1' ? ' XP' :
													version == '5.0' ? ' 2000' :
														version == '4.0' ? match :
															' ' + version
					)
				})
				.replace(windows64bitCPU, '(64-bit)')
				.trim().replace(/\s{2,}/, ' ')
		} else if (isDevice(identifiers, cros)) {
			return identifiers
				.filter((x) => !(crosNoise.test(x)))
				.join(' ')
				.replace((excludeBuild ? crosBuild : ''), '')
				.trim().replace(/\s{2,}/, ' ')
		} else if (isDevice(identifiers, linux)) {
			return identifiers
				.filter((x) => !(linuxNoise.test(x)))
				.join(' ')
				.trim().replace(/\s{2,}/, ' ')
		} else if (isDevice(identifiers, apple)) {
			return identifiers
				.map((x) => {
					const release = appleRelease.exec(x)?.[0]
					if (release) {
						const versionMap: Readonly<Record<string, string>> = {
							'10_7': 'Lion',
							'10_8': 'Mountain Lion',
							'10_9': 'Mavericks',
							'10_10': 'Yosemite',
							'10_11': 'El Capitan',
							'10_12': 'Sierra',
							'10_13': 'High Sierra',
							'10_14': 'Mojave',
							'10_15': 'Catalina',
							'11': 'Big Sur',
							'12': 'Monterey',
							'13': 'Ventura',
						}
						const version = (
							(/(\d{2}(_|\.)\d{1,2}|\d{2,})/.exec(release) || [])[0] ||
							''
						).replace(/\./g, '_')
						const isOSX = version.startsWith('10')
						const id = isOSX ? version : (/^\d{2,}/.exec(version) || [])[0]
						const codeName = id === undefined ? undefined : versionMap[id]
						return codeName ? `macOS ${codeName}` : release
					}
					return x
				})
				.filter((x) => !(appleNoise.test(x)))
				.join(' ')
				.replace(/\slike mac.+/ig, '')
				.trim().replace(/\s{2,}/, ' ')
		} else {
			const other = identifiers.filter((x) => otherOS.test(x))
			if (other.length) {
				return other.join(' ').trim().replace(/\s{2,}/, ' ')
			}
			return identifiers.join(' ')
		}
	} else {
		return 'unknown'
	}
}

export interface WindowsReleaseInput {
	platform?: string
	platformVersion?: string
	fontPlatformVersion?: string
}

const computeWindowsRelease = ({ platform, platformVersion = '', fontPlatformVersion = '' }: WindowsReleaseInput): string | undefined => {
	let supportsAccentColor = false
	try {
		supportsAccentColor = IS_BLINK && typeof CSS != 'undefined' && CSS.supports('accent-color', 'initial')
	} catch {}
	if ((platform != 'Windows') || !supportsAccentColor) {
		return
	}
	const platformVersionNumber = Number(/(\d+)\./.exec(platformVersion)?.[1] ?? Number.NaN)

	// https://github.com/WICG/ua-client-hints/issues/220#issuecomment-870858413
	// https://docs.microsoft.com/en-us/microsoft-edge/web-platform/how-to-detect-win11
	// https://docs.microsoft.com/en-us/microsoft-edge/web-platform/user-agent-guidance
	const release: Record<string, string> = {
		'0.1.0': '7',
		'0.2.0': '8',
		'0.3.0': '8.1',
		'1.0.0': '10 (1507)',
		'2.0.0': '10 (1511)',
		'3.0.0': '10 (1607)',
		'4.0.0': '10 (1703)',
		'5.0.0': '10 (1709)',
		'6.0.0': '10 (1803)',
		'7.0.0': '10 (1809)',
		'8.0.0': '10 (1903|1909)',
		'10.0.0': '10 (2004|20H2|21H1)',
		'11.0.0': '10',
		'12.0.0': '10',
	}

	const oldFontPlatformVersionNumber = (/7|8\.1|8/.exec(fontPlatformVersion)||[])[0]
	const version = (
		platformVersionNumber >= 13 ? '11' :
			platformVersionNumber == 0 && oldFontPlatformVersionNumber ? oldFontPlatformVersionNumber :
				(release[platformVersion] || 'Unknown')
	)
	return (
		`Windows ${version} [${platformVersion}]`
	)
}

// attempt windows 11 userAgent
interface UserAgentRestorationInput {
	userAgent?: string
	userAgentData?: UserAgentData
	fontPlatformVersion?: string
}

const attemptWindows11UserAgent = ({ userAgent, userAgentData, fontPlatformVersion = '' }: UserAgentRestorationInput): string | undefined => {
	if (!userAgent) return userAgent
	const { platformVersion, platform } = userAgentData || {}
	const windowsRelease = computeWindowsRelease({ platform, platformVersion, fontPlatformVersion })
	return (
		/Windows 11/.test(''+windowsRelease) || /Windows 11/.test(fontPlatformVersion) ?
		(''+userAgent).replace('Windows NT 10.0', 'Windows 11') :
			userAgent
	)
}

// attempt restore from User-Agent Reduction
const isUAPostReduction = (userAgent: string): boolean => {
	const matcher = /Mozilla\/5\.0 \((Macintosh; Intel Mac OS X 10_15_7|Windows NT 10\.0; Win64; x64|(X11; (CrOS|Linux) x86_64)|(Linux; Android 10(; K|)))\) AppleWebKit\/537\.36 \(KHTML, like Gecko\) Chrome\/\d+\.0\.0\.0( Mobile|) Safari\/537\.36/
	const unifiedPlatform = (matcher.exec(userAgent)||[])[1]
	return IS_BLINK && !!unifiedPlatform
}

const getUserAgentRestored = ({ userAgent = '', userAgentData, fontPlatformVersion = '' }: UserAgentRestorationInput): string | undefined => {
	if (!userAgent || !userAgentData/* || !isUAPostReduction(userAgent)*/) {
		return
	}
	const { brands, uaFullVersion, platformVersion = '', model: deviceModel, bitness } = userAgentData

	const isGoogleChrome = (
		/X11; CrOS/.test(userAgent) ||
		!!(brands || []).find((x) => x == 'Google Chrome')
	)
	const versionNumber = Number(/(\d+)\./.exec(platformVersion)?.[1] ?? Number.NaN)
	const windowsFontVersion = (/8\.1|8|7/.exec(fontPlatformVersion) || [])[0]
	const windowsVersion = (
		versionNumber >= 13 ? '11' :
		versionNumber == 0 ? (windowsFontVersion || '7/8/8.1') : '10'
	)
	const windowsVersionMap: Readonly<Record<string, string>> = {
		'7': 'NT 6.1',
		'8': 'NT 6.2',
		'8.1': 'NT 6.3',
		'10': 'NT 10.0',
	}
	const macVersion = platformVersion.replace(/\./g, '_')
	const userAgentRestored = userAgent
		.replace(/(Chrome\/)([^\s]+)/, (_match, p1, p2) => `${p1}${isGoogleChrome && uaFullVersion ? uaFullVersion : p2}`)
		.replace(/Windows NT 10.0/, `Windows ${windowsVersionMap[windowsVersion] || windowsVersion}`)
		.replace(/(X11; CrOS x86_64)/, (match, p1) => platformVersion ? `${p1} ${platformVersion}` : match)
		.replace(/(Linux; Android )(10)(; K|)/, (_match, p1, _p2, p3) => {
			return `${p1}${Number.isFinite(versionNumber) ? versionNumber : '10'}${
				!p3 ? '' : deviceModel ? `; ${deviceModel}` : '; K'
			}`
		})
		.replace(/(Macintosh; Intel Mac OS X )(10_15_7)/, (match, p1) => {
			if (!macVersion) return match
			const isOSX = macVersion.startsWith('10')
			return `${isOSX ? p1 : p1.replace('X ', '')}${macVersion}`
		})
		.replace(/(; Win64; x64| x86_64)/, (_match, p1) => bitness === '64' ? p1 : '')

	return userAgentRestored
}

const createPerformanceLogger = () => {
	const log: Record<string, string> = {}
	let total = 0
	return {
		logTestResult: ({ test, time = 0 }: { test: string, time?: number, passed?: boolean }) => {
			total += time
			const timeString = `${time.toFixed(2)}ms`
			log[test] = timeString
			return undefined
		},
		getLog: () => ({ ...log }),
		getTotal: () => total,
	}
}
const performanceLogger = createPerformanceLogger()
const { logTestResult } = performanceLogger

type Constructor<T> = abstract new (...args: never[]) => T

interface PromiseRaceInput<T> {
	promise: PromiseLike<unknown>
	responseType: Constructor<T>
	limit?: number
}

const getPromiseRaceFulfilled = async <T>({
	promise,
	responseType,
	limit = 1000,
}: PromiseRaceInput<T>): Promise<T | undefined> => {
	const pending = Symbol('pending')
	let timeout: ReturnType<typeof setTimeout> | undefined
	const slowPromise = new Promise<typeof pending>((resolve) => {
		timeout = setTimeout(() => resolve(pending), limit)
	})
	try {
		const response = await Promise.race([slowPromise, promise])
		return response === pending || !(response instanceof responseType) ? undefined : response
	} catch {
		return undefined
	} finally {
		if (timeout !== undefined) clearTimeout(timeout)
	}
}

interface Timer {
	start(): number
	stop(): number
}

const createTimer = () => {
	let start: number | undefined
	const log: number[] = []
	return {
		stop: () => {
			if (start !== undefined) {
				const elapsed = performance.now() - start
				start = undefined
				log.push(elapsed)
				return log.reduce((acc, n) => acc += n, 0)
			}
			return log.reduce((acc, n) => acc += n, 0)
		},
		start: () => {
			start = performance.now()
			return start
		},
	} satisfies Timer
}

const queueEvent = (timer: Timer, delay = 0): Promise<number> => {
	timer.stop()
	return new Promise((resolve, reject) => setTimeout(() => {
		try {
			resolve(timer.start())
		} catch (error) {
			reject(error)
		}
	}, delay))
}

const queueTask = (): Promise<null> => new Promise((resolve) => setTimeout(() => resolve(null)))

const formatEmojiSet = (emojiSet: readonly string[] | undefined, limit = 3): string => {
	const maxLen = (limit * 2) + 3
	const list = (emojiSet || [])
	return list.length > maxLen ? `${list.slice(0, limit).join('')}...${list.slice(-limit).join('')}` :
		list.join('')
}

const EMOJIS = [
	[128512], [9786], [129333, 8205, 9794, 65039], [9832], [9784], [9895], [8265], [8505], [127987, 65039, 8205, 9895, 65039], [129394], [9785], [9760], [129489, 8205, 129456], [129487, 8205, 9794, 65039], [9975], [129489, 8205, 129309, 8205, 129489], [9752], [9968], [9961], [9972], [9992], [9201], [9928], [9730], [9969], [9731], [9732], [9976], [9823], [9937], [9000], [9993], [9999],

	[128105, 8205, 10084, 65039, 8205, 128139, 8205, 128104],
	[128104, 8205, 128105, 8205, 128103, 8205, 128102],
	[128104, 8205, 128105, 8205, 128102],

	// android 11
	[128512],
	[169], [174], [8482],
	[128065, 65039, 8205, 128488, 65039],

	// other
	[10002], [9986], [9935], [9874], [9876], [9881], [9939], [9879], [9904], [9905], [9888], [9762], [9763], [11014], [8599], [10145], [11013], [9883], [10017], [10013], [9766], [9654], [9197], [9199], [9167], [9792], [9794], [10006], [12336], [9877], [9884], [10004], [10035], [10055], [9724], [9642], [10083], [10084], [9996], [9757], [9997], [10052], [9878], [8618], [9775], [9770], [9774], [9745], [10036], [127344], [127359],
].map((emojiCode) => String.fromCodePoint(...emojiCode))

const CSS_FONT_FAMILY = `
	'Segoe Fluent Icons',
	'Ink Free',
	'Bahnschrift',
	'Segoe MDL2 Assets',
	'HoloLens MDL2 Assets',
	'Leelawadee UI',
	'Javanese Text',
	'Segoe UI Emoji',
	'Aldhabi',
	'Gadugi',
	'Myanmar Text',
	'Nirmala UI',
	'Lucida Console',
	'Cambria Math',
	'Bai Jamjuree',
	'Chakra Petch',
	'Charmonman',
	'Fahkwang',
	'K2D',
	'Kodchasan',
	'KoHo',
	'Sarabun',
	'Srisakdi',
	'Galvji',
	'MuktaMahee Regular',
	'InaiMathi Bold',
	'American Typewriter Semibold',
	'Futura Bold',
	'SignPainter-HouseScript Semibold',
	'PingFang HK Light',
	'Kohinoor Devanagari Medium',
	'Luminari',
	'Geneva',
	'Helvetica Neue',
	'Droid Sans Mono',
	'Dancing Script',
	'Roboto',
	'Ubuntu',
	'Liberation Mono',
	'Source Code Pro',
	'DejaVu Sans',
	'OpenSymbol',
	'Chilanka',
	'Cousine',
	'Arimo',
	'Jomolhari',
	'MONO',
	'Noto Color Emoji',
	sans-serif !important
`

const hashSlice = (value: string | null | undefined): string | null | undefined => !value ? value : value.slice(0, 8)

function getGpuBrand(gpu: string): string | null {
	if (!gpu) return null
	const gpuBrandMatcher = /(adreno|amd|apple|intel|llvm|mali|microsoft|nvidia|parallels|powervr|samsung|swiftshader|virtualbox|vmware)/i

	const brand = (
		/radeon/i.test(gpu) ? 'AMD' :
			/geforce/i.test(gpu) ? 'NVIDIA' :
			(gpuBrandMatcher.exec(gpu)?.[0] || 'other').toUpperCase()
	)

	return brand
}

// collect fingerprints for analysis
const Analysis: Record<string, unknown> = {}

// use if needed to stable fingerprint
const LowerEntropy: Record<string, boolean> = {
	AUDIO: false,
	CANVAS: false,
	FONTS: false,
	IFRAME_SCREEN: false,
	SCREEN: false,
	TIME_ZONE: false,
	WEBGL: false,
}

export { IS_BLINK, IS_GECKO, IS_WEBKIT, JS_ENGINE, LIKE_BRAVE, LIKE_BRAVE_RESISTANCE, ENGINE_IDENTIFIER, braveBrowser, getBraveMode, getBraveUnprotectedParameters, getOS, getReportedPlatform, USER_AGENT_OS, PLATFORM_OS, decryptUserAgent, getUserAgentPlatform, computeWindowsRelease, attemptWindows11UserAgent, isUAPostReduction, getUserAgentRestored, logTestResult, performanceLogger, getPromiseRaceFulfilled, queueEvent, queueTask, createTimer, formatEmojiSet, EMOJIS, CSS_FONT_FAMILY, hashSlice, Analysis, LowerEntropy, getGpuBrand }
