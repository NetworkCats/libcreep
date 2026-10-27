import { captureError } from '../errors'
import { createLieDetector, documentLie } from '../lies'
import { getWebGLRendererConfidence, compressWebGLRenderer } from '../trash'
import {
	createTimer,
	queueEvent,
	getOS,
	getUserAgentPlatform,
	decryptUserAgent,
	JS_ENGINE,
	logTestResult,
	isUAPostReduction,
	IS_WORKER_SCOPE,
	IS_BLINK,
	getReportedPlatform,
} from '../utils/helpers'
import type { WorkerStrategy } from '../../types'
import { unsupported } from '../utils/unsupported'

interface UserAgentBrand {
	brand: string
	version: string
}

interface WorkerUserAgentData extends Record<string, unknown> {
	brands?: string[]
	brandsVersion?: string[]
	mobile?: boolean
	platform?: string
	platformVersion?: string
	uaFullVersion?: string
}

interface WorkerNavigatorExtension extends Navigator {
	deviceMemory?: number
	userAgentData?: {
		brands?: UserAgentBrand[]
		mobile?: boolean
		getHighEntropyValues: (
			hints: string[],
		) => Promise<Record<string, unknown> & { brands?: UserAgentBrand[]; mobile?: boolean }>
	}
}

interface WorkerLieData {
	proto: false | Record<string, string[]>
	[key: string]: string | false | Record<string, string[]>
}

interface WorkerScopeData extends Record<string, unknown> {
	device?: string
	deviceMemory?: number
	engineCurrencyLocale?: string
	gpu?: Record<string, unknown>
	hardwareConcurrency?: number
	language?: string
	languages?: string[]
	lied: boolean | number
	lies: WorkerLieData
	locale?: string
	localeEntropyIsTrusty?: boolean
	localeIntlEntropyIsTrusty?: boolean
	platform?: string
	system?: string
	systemCurrencyLocale?: string
	timezoneLocation?: string
	timezoneOffset?: number
	uaPostReduction?: boolean
	userAgent?: string
	userAgentData?: WorkerUserAgentData
	userAgentDataVersion?: string
	userAgentEngine?: string
	userAgentVersion?: string
	webglRenderer?: string
	webglVendor?: string
}

const getAbortReason = (signal?: AbortSignal) => (
	signal?.reason ?? new DOMException('Worker detection was aborted.', 'AbortError')
)

const ask = <T>(fn: () => T): T | undefined => {
	try {
		return fn()
	} catch {
		return
	}
}

export async function spawnWorker() {

	function getWorkerPrototypeLies(scope: Window & typeof globalThis) {
		const lieDetector = createLieDetector(scope)
		const { searchLies } = lieDetector

		searchLies(() => Function, {
			target: ['toString'],
			ignore: ['caller', 'arguments'],
		})
		const WorkerNavigatorConstructor = Reflect.get(globalThis, 'WorkerNavigator')
		if (typeof WorkerNavigatorConstructor == 'function') {
			searchLies(() => WorkerNavigatorConstructor, {
				target: ['deviceMemory', 'hardwareConcurrency', 'language', 'languages', 'platform', 'userAgent'],
			})
		}
		// return lies list and detail
		const props = lieDetector.getProps()
		const propsSearched = lieDetector.getPropsSearched()
		return {
			lieDetector,
			lieList: Object.keys(props).sort(),
			lieDetail: props,
			lieCount: Object.keys(props).reduce((acc, key) => acc + (props[key]?.length ?? 0), 0),
			propsSearched,
		}
	}

	const getUserAgentData = async (
		navigatorObject: WorkerNavigatorExtension,
	): Promise<WorkerUserAgentData | undefined> => {
		const userAgentData = navigatorObject.userAgentData
		if (!userAgentData || typeof userAgentData.getHighEntropyValues != 'function') {
			return
		}
		const rawData = await userAgentData.getHighEntropyValues([
			'platform',
			'platformVersion',
			'architecture',
			'bitness',
			'model',
			'uaFullVersion',
		])
		const { brands, mobile } = userAgentData
		const compressedBrands = (brandList: readonly UserAgentBrand[] = [], captureVersion: boolean = false) =>
			brandList
				.filter((obj) => !/Not/.test(obj.brand))
				.map((obj) => `${obj.brand}${captureVersion ? ` ${obj.version}` : ''}`)
		const removeChromium = (brandList: string[]) =>
			brandList.length > 1 ? brandList.filter((brand) => !/Chromium/.test(brand)) : brandList

		// compress brands
		const resolvedBrands = Array.isArray(rawData.brands) ? rawData.brands : (brands ?? [])
		const data: WorkerUserAgentData = {}
		for (const [key, value] of Object.entries(rawData)) {
			if (key != 'brands') data[key] = value
		}
		data.brandsVersion = removeChromium(compressedBrands(resolvedBrands, true))
		data.brands = removeChromium(compressedBrands(resolvedBrands))

		if (data.mobile === undefined) {
			data.mobile = mobile
		}
		const dataSorted = Object.keys(data)
			.sort()
			.reduce<WorkerUserAgentData>((acc, key) => {
				acc[key] = data[key]
				return acc
			}, {})
		return dataSorted
	}

	const getWebglData = () =>
		ask(() => {
			const canvasOffscreenWebgl = new OffscreenCanvas(256, 256)
			const contextWebgl = canvasOffscreenWebgl.getContext('webgl')
			if (!contextWebgl) return undefined
			try {
				const rendererInfo = contextWebgl.getExtension('WEBGL_debug_renderer_info')
				if (!rendererInfo) return undefined
				const vendor = contextWebgl.getParameter(rendererInfo.UNMASKED_VENDOR_WEBGL)
				const renderer = contextWebgl.getParameter(rendererInfo.UNMASKED_RENDERER_WEBGL)
				return {
					webglVendor: typeof vendor == 'string' ? vendor : undefined,
					webglRenderer: typeof renderer == 'string' ? renderer : undefined,
				}
			} finally {
				// A shared worker outlives each collection; release its context.
				try {
					contextWebgl.getExtension('WEBGL_lose_context')?.loseContext()
				} catch {}
			}
		})

	const computeTimezoneOffset = () => {
		const nowDate = new Date()
		const date = nowDate.getDate()
		const month = nowDate.getMonth()
		const year = nowDate.getFullYear()
		const localMidnight = +new Date(year, month, date)
		const utcMidnight = Date.UTC(year, month, date)
		return +((localMidnight - utcMidnight) / 60000).toFixed(0)
	}

	const getLocale = () => {
		const constructors: ReadonlyArray<() => { resolvedOptions(): { locale: string } }> = [
			() => new Intl.Collator(),
			() => new Intl.DateTimeFormat(),
			() => new Intl.DisplayNames(undefined, { type: 'language' }),
			() => new Intl.ListFormat(),
			() => new Intl.NumberFormat(),
			() => new Intl.PluralRules(),
			() => new Intl.RelativeTimeFormat(),
		]
		const locale = constructors.reduce<string[]>((acc, create) => {
			try {
				const { locale } = create().resolvedOptions()
				return [...acc, locale]
			} catch {
				return acc
			}
		}, [])

		return [...new Set(locale)]
	}

	const getWorkerData = async () => {
		const timer = createTimer()
		await queueEvent(timer)

		const workerNavigator = navigator as WorkerNavigatorExtension
		const userAgentData = await getUserAgentData(workerNavigator).catch((error) =>
			captureError(error, 'worker userAgentData failed'),
		)

		// webgl
		const { webglVendor, webglRenderer } = getWebglData() || {}

		// timezone & locale
		const timezoneOffset = computeTimezoneOffset()
		// eslint-disable-next-line new-cap
		const timezoneLocation = Intl.DateTimeFormat().resolvedOptions().timeZone
		const locale = getLocale()

		// navigator
		const { hardwareConcurrency, language, languages, platform, userAgent, deviceMemory } = workerNavigator

		// prototype lies
		await queueEvent(timer)
		const {
			// lieDetector: lieProps,
			lieList,
			lieDetail,
			// lieCount,
			// propsSearched,
		} = getWorkerPrototypeLies(self) // execute and destructure the list and detail
		// const prototypeLies = JSON.parse(JSON.stringify(lieDetail))
		const protoLieLen = lieList.length

		// match engine locale to system locale to determine if locale entropy is trusty
		let systemCurrencyLocale
		const lang = ('' + language).split(',')[0]
		try {
			systemCurrencyLocale = (1).toLocaleString(lang || undefined, {
				style: 'currency',
				currency: 'USD',
				currencyDisplay: 'name',
				minimumFractionDigits: 0,
				maximumFractionDigits: 0,
			})
		} catch {}
		const engineCurrencyLocale = (1).toLocaleString(undefined, {
			style: 'currency',
			currency: 'USD',
			currencyDisplay: 'name',
			minimumFractionDigits: 0,
			maximumFractionDigits: 0,
		})
		const localeEntropyIsTrusty = engineCurrencyLocale == systemCurrencyLocale
		const localeIntlEntropyIsTrusty = new Set(('' + language).split(',')).has('' + locale)

		const { href } = self.location
		// Library consumers may host the worker at any path or from a blob URL.
		// The upstream demo's `/creep.js` path check is therefore not a browser
		// integrity signal in a reusable package.
		const locationPathNameLie = !href

		return {
			lied: protoLieLen || +locationPathNameLie,
			lies: {
				proto: protoLieLen ? lieDetail : false,
			},
			locale: '' + locale,
			systemCurrencyLocale,
			engineCurrencyLocale,
			localeEntropyIsTrusty,
			localeIntlEntropyIsTrusty,
			timezoneOffset,
			timezoneLocation,
			deviceMemory,
			hardwareConcurrency,
			language,
			languages: [...languages],
			platform,
			userAgent,
			webglRenderer,
			webglVendor,
			userAgentData,
		}
	}

	// Compute and communicate from worker scope
	const onEvent = (eventType: string, listener: EventListener) => globalThis.addEventListener(eventType, listener)
	const send = (source: unknown) => {
		// Reply with null on failure so the window falls back immediately
		// instead of waiting for its give-up timeout.
		return getWorkerData().catch(() => null).then((data) => {
			if (source == null || (typeof source != 'object' && typeof source != 'function')) return
			const postMessage = Reflect.get(source, 'postMessage')
			if (typeof postMessage == 'function') Reflect.apply(postMessage, source, [data])
		})
	}
	if (IS_WORKER_SCOPE) {
		if ('ServiceWorkerGlobalScope' in globalThis)
			onEvent('message', ((event: MessageEvent) => {
				const source = event.source
				if (!source || typeof source.postMessage != 'function') return
				const response = send(source)
				const waitUntil = Reflect.get(event, 'waitUntil')
				return typeof waitUntil == 'function' ? Reflect.apply(waitUntil, event, [response]) : response
			}) as EventListener)
		else if ('SharedWorkerGlobalScope' in globalThis)
			onEvent('connect', ((event: Event) => {
				const ports = Reflect.get(event, 'ports')
				const port = Array.isArray(ports) ? ports[0] : undefined
				if (port && typeof port.postMessage == 'function') void send(port)
			}) as EventListener)
		else if (typeof self.postMessage == 'function') void send(self) // DedicatedWorkerGlobalScope
	}
}

export default async function getBestWorkerScope(
	scriptSource: string | URL = './creep.js',
	strategy: WorkerStrategy = 'auto',
	signal?: AbortSignal,
) {
	try {
		const timer = createTimer()
		await queueEvent(timer)
		const throwIfAborted = () => {
			if (!signal?.aborted) return
			throw getAbortReason(signal)
		}
		throwIfAborted()

		const hasMethod = (value: unknown, name: PropertyKey): boolean => {
			try {
				return (
					value != null &&
					(typeof value == 'object' || typeof value == 'function') &&
					typeof Reflect.get(value, name) == 'function'
				)
			} catch {
				return false
			}
		}
		const isDedicatedWorker = (value: unknown): value is Worker =>
			hasMethod(value, 'postMessage') && hasMethod(value, 'terminate')
		const isSharedWorker = (value: unknown): value is SharedWorker => {
			try {
				const port =
					value != null && (typeof value == 'object' || typeof value == 'function')
						? Reflect.get(value, 'port')
						: undefined
				return hasMethod(port, 'close') && hasMethod(port, 'postMessage') && hasMethod(port, 'start')
			} catch {
				return false
			}
		}
		const isServiceWorkerRegistration = (value: unknown): value is ServiceWorkerRegistration =>
			hasMethod(value, 'unregister')
		const getDedicatedWorker = ({ scriptSource }: { scriptSource: string | URL }) =>
			new Promise<WorkerScopeData | null>((resolve, reject) => {
				let dedicatedWorker: Worker | undefined
				let settled = false
				const terminate = () => {
					try {
						dedicatedWorker?.terminate()
					} catch {}
				}
				const finish = (
					value: WorkerScopeData | null | undefined,
					error?: unknown,
					rejected: boolean = false,
				) => {
					if (settled) return
					settled = true
					clearTimeout(giveUpOnWorker)
					signal?.removeEventListener('abort', abort)
					terminate()
					if (rejected) reject(error)
					else resolve(value ?? null)
				}
				const abort = () =>
					finish(
						undefined,
						getAbortReason(signal),
						true,
					)
				const giveUpOnWorker = setTimeout(() => finish(null), 3000)
				signal?.addEventListener('abort', abort, { once: true })
				if (signal?.aborted) return abort()

				dedicatedWorker = ask(() => new Worker(scriptSource, { type: 'module' }))
				if (!isDedicatedWorker(dedicatedWorker)) return finish(null)
				try {
					dedicatedWorker.onmessage = (event) => finish(event.data as WorkerScopeData)
					dedicatedWorker.onerror = () => finish(null)
					dedicatedWorker.onmessageerror = () => finish(null)
				} catch {
					return finish(null)
				}
			})
		const getSharedWorker = ({ scriptSource }: { scriptSource: string | URL }) =>
			new Promise<WorkerScopeData | null>((resolve, reject) => {
				let sharedWorker: SharedWorker | undefined
				let settled = false
				const close = () => {
					try {
						sharedWorker?.port.close()
					} catch {}
				}
				const finish = (
					value: WorkerScopeData | null | undefined,
					error?: unknown,
					rejected: boolean = false,
				) => {
					if (settled) return
					settled = true
					clearTimeout(giveUpOnWorker)
					signal?.removeEventListener('abort', abort)
					close()
					if (rejected) reject(error)
					else resolve(value ?? null)
				}
				const abort = () =>
					finish(
						undefined,
						getAbortReason(signal),
						true,
					)
				const giveUpOnWorker = setTimeout(() => finish(null), 3000)
				signal?.addEventListener('abort', abort, { once: true })
				if (signal?.aborted) return abort()

				sharedWorker = ask(() => new SharedWorker(scriptSource, { type: 'module' }))
				if (!isSharedWorker(sharedWorker)) return finish(null)
				try {
					sharedWorker.port.start()
					sharedWorker.port.onmessage = (event) => finish(event.data as WorkerScopeData)
					sharedWorker.port.onmessageerror = () => finish(null)
					sharedWorker.onerror = () => finish(null)
				} catch {
					return finish(null)
				}
			})
		const getServiceWorker = ({ scriptSource }: { scriptSource: string | URL }) =>
			new Promise<WorkerScopeData | null>((resolve, reject) => {
				let registration: ServiceWorkerRegistration | undefined
				let registrationRequest: Promise<ServiceWorkerRegistration> | undefined
				let stateWorker: ServiceWorker | null | undefined
				let settled = false
				let settling = false
				const waitForCleanup = <T>(operation: PromiseLike<T>, limit: number = 1000): Promise<T | undefined> =>
					new Promise((resolve) => {
						let cleanupSettled = false
						const finishCleanup = (value?: T) => {
							if (cleanupSettled) return
							cleanupSettled = true
							clearTimeout(cleanupTimeout)
							resolve(value)
						}
						const cleanupTimeout = setTimeout(() => finishCleanup(), limit)
						void Promise.resolve(operation).then(finishCleanup, () => finishCleanup())
					})
				const unregisterBestEffort = (cleanupTarget: unknown) => {
					if (!isServiceWorkerRegistration(cleanupTarget)) return
					try {
						void Promise.resolve(cleanupTarget.unregister()).catch(() => undefined)
					} catch {}
				}
				// register() resolves relative URLs against the document base URL.
				const expectedScriptURL = new URL(scriptSource, globalThis.document?.baseURI ?? location.href).href
				const onMessage = (event: MessageEvent<WorkerScopeData>) => {
					const sourceScriptURL = event.source && Reflect.get(event.source, 'scriptURL')
					if (sourceScriptURL != expectedScriptURL) return
					finish(event.data)
				}
				const onStateChange = () => {
					try {
						if (stateWorker?.state == 'redundant') return finish(null)
						if (stateWorker?.state != 'activated') return
						navigator.serviceWorker.addEventListener('message', onMessage)
						stateWorker.postMessage(undefined)
					} catch {
						return finish(null)
					}
				}
				const cleanupRegistration = async () => {
					let cleanupTarget = registration
					if (!cleanupTarget && registrationRequest) {
						cleanupTarget = await waitForCleanup(registrationRequest)
						if (cleanupTarget) registration = cleanupTarget
						else cleanupTarget = registration
					}
					if (!isServiceWorkerRegistration(cleanupTarget)) return
					try {
						await waitForCleanup(Promise.resolve(cleanupTarget.unregister()))
					} catch {}
				}
				const finish = (
					value: WorkerScopeData | null | undefined,
					error?: unknown,
					rejected: boolean = false,
				) => {
					if (settled || settling) return
					settling = true
					clearTimeout(giveUpOnWorker)
					signal?.removeEventListener('abort', abort)
					try {
						navigator.serviceWorker?.removeEventListener('message', onMessage)
					} catch {}
					try {
						stateWorker?.removeEventListener('statechange', onStateChange)
					} catch {}
					void cleanupRegistration().then(() => {
						settled = true
						if (rejected) reject(error)
						else resolve(value ?? null)
					})
				}
				const abort = () =>
					finish(
						undefined,
						getAbortReason(signal),
						true,
					)
				const giveUpOnWorker = setTimeout(() => finish(null), 4000)
				signal?.addEventListener('abort', abort, { once: true })
				if (signal?.aborted) return abort()
				if (!ask(() => navigator.serviceWorker.register)) return finish(null)
				try {
					const scope = new URL(
						`./__libcreep-${Date.now()}-${Math.random().toString(36).slice(2)}/`,
						expectedScriptURL,
					).href
					registrationRequest = navigator.serviceWorker.register(expectedScriptURL, {
						type: 'module',
						scope,
					})
				} catch {
					return finish(null)
				}

				return Promise.resolve(registrationRequest)
					.then((registered) => {
						registration = registered
						if (settled) {
							unregisterBestEffort(registration)
							return
						}
						if (settling) return
						if (!isServiceWorkerRegistration(registration)) return finish(null)
						stateWorker = registration.installing || registration.waiting || registration.active
						if (!stateWorker) return finish(null)
						stateWorker.addEventListener('statechange', onStateChange)
						return onStateChange()
					})
					.catch(() => finish(null))
			})

		type WorkerTransport = 'service' | 'shared' | 'dedicated'
		const workerOrder: WorkerTransport[] =
			strategy == 'service-first'
				? ['service', 'shared', 'dedicated']
				: strategy == 'dedicated-only'
					? ['dedicated']
					: ['shared', 'dedicated']
		let workerScope: WorkerScopeData | null = null
		for (const workerType of workerOrder) {
			throwIfAborted()
			const getWorker =
				workerType == 'service'
					? getServiceWorker
					: workerType == 'shared'
						? getSharedWorker
						: getDedicatedWorker
			workerScope = await getWorker({ scriptSource })
			if (workerScope?.userAgent) break
		}
		if (!workerScope?.userAgent) {
			return unsupported('worker-unavailable')
		}
		workerScope.system = getOS(workerScope.userAgent)
		workerScope.device = getUserAgentPlatform({
			userAgent: workerScope.userAgent,
		})

		// detect lies
		const { system, userAgent, userAgentData, platform, deviceMemory, hardwareConcurrency } = workerScope

		// navigator lies
		// skip language and languages to respect valid engine language switching bug in Chrome
		// these are more likely navigator lies, so don't trigger lied worker scope
		const workerScopeMatchLie = 'does not match worker scope'
		if (platform != navigator.platform) {
			documentLie('Navigator.platform', workerScopeMatchLie)
		}
		if (userAgent != navigator.userAgent) {
			documentLie('Navigator.userAgent', workerScopeMatchLie)
		}
		if (hardwareConcurrency && hardwareConcurrency != navigator.hardwareConcurrency) {
			documentLie('Navigator.hardwareConcurrency', workerScopeMatchLie)
		}
		const navigatorDeviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory
		if (deviceMemory && deviceMemory != navigatorDeviceMemory) {
			documentLie('Navigator.deviceMemory', workerScopeMatchLie)
		}

		// prototype lies
		if (workerScope.lies.proto) {
			const { proto } = workerScope.lies
			const keys = Object.keys(proto)
			keys.forEach((key) => {
				const api = `WorkerGlobalScope.${key}`
				const lies = proto[key]
				lies?.forEach((lie) => documentLie(api, lie))
			})
		}

		// user agent os lie
		const [userAgentOS, platformOS] = getReportedPlatform(userAgent, platform)
		if (userAgentOS != platformOS) {
			workerScope.lied = true
			workerScope.lies.os = `${platformOS} platform and ${userAgentOS} user agent do not match`
			documentLie('WorkerGlobalScope', workerScope.lies.os)
		}

		// user agent engine lie
		const decryptedName = decryptUserAgent({
			ua: userAgent,
			os: system,
			isBrave: false, // default false since we are only looking for JS runtime and version
		})
		const userAgentEngine =
			/safari/i.test(decryptedName) || /iphone|ipad/i.test(userAgent)
				? 'JavaScriptCore'
				: /firefox/i.test(userAgent)
					? 'SpiderMonkey'
					: /chrome/i.test(userAgent)
						? 'V8'
						: undefined
		if (userAgentEngine != JS_ENGINE) {
			workerScope.lied = true
			workerScope.lies.engine = `${JS_ENGINE} JS runtime and ${userAgentEngine} user agent do not match`
			documentLie('WorkerGlobalScope', workerScope.lies.engine)
		}
		// user agent version lie
		const getVersion = (x?: string) => (/\d+/.exec(x ?? '') || [])[0]
		const userAgentVersion = getVersion(decryptedName)
		const userAgentDataVersion = getVersion(userAgentData ? userAgentData.uaFullVersion : '')
		const versionSupported = userAgentDataVersion && userAgentVersion
		const versionMatch = userAgentDataVersion == userAgentVersion
		if (versionSupported && !versionMatch) {
			workerScope.lied = true
			workerScope.lies.version = `userAgentData version ${userAgentDataVersion} and user agent version ${userAgentVersion} do not match`
			documentLie('WorkerGlobalScope', workerScope.lies.version)
		}

		// platformVersion lie
		const FEATURE_CASE =
			IS_BLINK &&
			(() => {
				try {
					return typeof globalThis.CSS?.supports == 'function' && CSS.supports('accent-color: initial')
				} catch {
					return false
				}
			})()
		const getPlatformVersionLie = (device?: string, userAgentData?: WorkerUserAgentData) => {
			const deviceName = device ?? ''
			if (!/windows|mac/i.test(deviceName) || !userAgentData?.platformVersion) {
				return false
			}

			if (userAgentData.platform == 'macOS') {
				return FEATURE_CASE ? /_/.test(userAgentData.platformVersion) : false
			}

			const reportedVersionNumber = (/windows ([\d.]+)/i.exec(deviceName) || [])[1] ?? ''
			const windows10OrHigherReport = +reportedVersionNumber == 10
			const { platformVersion } = userAgentData
			const versionMap: Record<string, string> = {
				'6.1': '7',
				'6.2': '8',
				'6.3': '8.1',
				'10.0': '10',
			}
			const version = versionMap[platformVersion]
			if (!FEATURE_CASE && version) {
				return version != reportedVersionNumber
			}

			const parts = platformVersion.split('.')
			if (parts.length != 3) return true

			const windows10OrHigherPlatform = Number(parts[0] ?? '') > 0
			return (
				(windows10OrHigherPlatform && !windows10OrHigherReport) ||
				(!windows10OrHigherPlatform && windows10OrHigherReport)
			)
		}
		const windowsVersionLie = getPlatformVersionLie(workerScope.device, userAgentData)
		if (windowsVersionLie) {
			workerScope.lied = true
			workerScope.lies.platformVersion = `platform version is fake`
			documentLie('WorkerGlobalScope', workerScope.lies.platformVersion)
		}

		// capture userAgent version
		workerScope.userAgentVersion = userAgentVersion
		workerScope.userAgentDataVersion = userAgentDataVersion
		workerScope.userAgentEngine = userAgentEngine

		const gpu = {
			...getWebGLRendererConfidence(workerScope.webglRenderer),
			compressedGPU: compressWebGLRenderer(workerScope.webglRenderer),
		}

		logTestResult({
			time: timer.stop(),
			test: 'worker',
			passed: true,
		})
		return {
			...workerScope,
			gpu,
			uaPostReduction: isUAPostReduction(workerScope.userAgent),
		}
	} catch (error) {
		if (signal?.aborted) {
			throw getAbortReason(signal)
		}
		logTestResult({ test: 'worker', passed: false })
		captureError(error, 'workers failed or blocked by client')
		throw error
	}
}
