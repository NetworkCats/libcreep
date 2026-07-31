import { attempt, caniuse, captureError } from '../errors'
import { lieProps, documentLie, getPluginLies } from '../lies'
import { sendToTrash, gibberish } from '../trash'
import { hashMini } from '../utils/crypto'
import {
	createTimer,
	queueEvent,
	getOS,
	braveBrowser,
	decryptUserAgent,
	getUserAgentPlatform,
	isUAPostReduction,
	logTestResult,
	USER_AGENT_OS,
	PLATFORM_OS,
	Analysis,
} from '../utils/helpers'

interface WorkerNavigatorData {
	platform?: string
	userAgent?: string
	deviceMemory?: number
	hardwareConcurrency?: number
	language?: string
	languages?: readonly string[]
	webglRenderer?: string
}

interface UserAgentBrand {
	brand: string
	version: string
}

interface HighEntropyValues extends Record<string, unknown> {
	brands?: UserAgentBrand[]
	mobile?: boolean
}

interface UserAgentDataLike {
	brands?: UserAgentBrand[]
	mobile?: boolean
	getHighEntropyValues?: (hints: string[]) => Promise<HighEntropyValues>
}

interface GPUAdapterInfoLike {
	architecture?: string
	description?: string
	device?: string
	vendor?: string
}

interface GPUAdapterLike {
	features?: ReadonlySet<string>
	info?: GPUAdapterInfoLike
	limits?: Record<string, number>
	requestAdapterInfo?: () => Promise<GPUAdapterInfoLike>
}

interface NavigatorExtensions {
	deviceMemory?: number
	globalPrivacyControl?: boolean
	oscpu?: string
	userAgentData?: UserAgentDataLike
	bluetooth?: {
		getAvailability?: () => Promise<boolean>
	}
	gpu?: {
		requestAdapter: () => Promise<GPUAdapterLike | null>
	}
}

// special thanks to https://arh.antoinevastel.com for inspiration
export default async function getNavigator(workerScope?: WorkerNavigatorData) {
	try {
		const extendedNavigator = navigator as Navigator & NavigatorExtensions
		const timer = createTimer()
		await queueEvent(timer)
		let lied =
			lieProps['Navigator.appVersion'] ||
			lieProps['Navigator.deviceMemory'] ||
			lieProps['Navigator.doNotTrack'] ||
			lieProps['Navigator.hardwareConcurrency'] ||
			lieProps['Navigator.language'] ||
			lieProps['Navigator.languages'] ||
			lieProps['Navigator.maxTouchPoints'] ||
			lieProps['Navigator.oscpu'] ||
			lieProps['Navigator.platform'] ||
			lieProps['Navigator.userAgent'] ||
			lieProps['Navigator.vendor'] ||
			lieProps['Navigator.plugins'] ||
			lieProps['Navigator.mimeTypes'] ||
			false

		const credibleUserAgent = 'chrome' in window ? navigator.userAgent.includes(navigator.appVersion) : true
		const settleAsyncSignal = <T>(operation: T | PromiseLike<T>, fallback: T, limit: number = 3000): Promise<T> =>
			new Promise((resolve) => {
				let settled = false
				const finish = (value: T) => {
					if (settled) return
					settled = true
					clearTimeout(timeout)
					resolve(value)
				}
				const timeout = setTimeout(() => finish(fallback), limit)
				void Promise.resolve(operation).then(finish, () => finish(fallback))
			})
		const languageData = attempt(() => {
			const { language, languages } = navigator

			if (language && languages.length) {
				const lang = /^.{0,2}/g.exec(language)?.[0]
				const langs = /^.{0,2}/g.exec(languages[0] ?? '')?.[0]
				if (langs != lang) {
					sendToTrash('language/languages', `${[language, languages].join(' ')} mismatch`)
				}
			}

			if (workerScope && language != workerScope.language) {
				lied = true
				documentLie(`Navigator.language`, `${language} does not match worker scope`)
			}

			const workerLanguages = workerScope?.languages
			if (
				workerLanguages &&
				(languages.length != workerLanguages.length ||
					languages.some((value, index) => value != workerLanguages[index]))
			) {
				lied = true
				documentLie(`Navigator.languages`, `${languages} does not match worker scope`)
			}

			return { language, languages: [...languages] }
		}, 'language(s) failed')
		const data = {
			platform: attempt(() => {
				const { platform } = navigator
				const systems = [
					'win',
					'linux',
					'mac',
					'arm',
					'pike',
					'linux',
					'iphone',
					'ipad',
					'ipod',
					'android',
					'x11',
				]
				const trusted =
					typeof platform == 'string' && systems.filter((val) => platform.toLowerCase().includes(val))[0]

				if (!trusted) {
					sendToTrash(`platform`, `${platform} is unusual`)
				}

				// user agent os lie
				if (USER_AGENT_OS !== PLATFORM_OS) {
					lied = true
					documentLie(
						`Navigator.platform`,
						`${PLATFORM_OS} platform and ${USER_AGENT_OS} user agent do not match`,
					)
				}

				if (workerScope && platform != workerScope.platform) {
					lied = true // documented in the worker source
				}

				return platform
			}),
			system: attempt(() => getOS(navigator.userAgent), 'userAgent system failed'),
			userAgentParsed: await attempt(async () => {
				const reportedUserAgent = caniuse(() => navigator.userAgent)
				if (reportedUserAgent === undefined) return undefined
				const reportedSystem = getOS(reportedUserAgent)
				const isBrave = await braveBrowser()
				const report = decryptUserAgent({
					ua: reportedUserAgent,
					os: reportedSystem,
					isBrave,
				})
				return report
			}),
			device: attempt(() => getUserAgentPlatform({ userAgent: navigator.userAgent }), 'userAgent device failed'),
			userAgent: attempt(() => {
				const { userAgent } = navigator

				if (!credibleUserAgent) {
					sendToTrash('userAgent', `${userAgent} does not match appVersion`)
				}
				if (/\s{2,}|^\s|\s$/g.test(userAgent)) {
					sendToTrash('userAgent', `extra spaces detected`)
				}
				const gibbers = gibberish(userAgent)
				if (gibbers.length) {
					sendToTrash(`userAgent is gibberish`, userAgent)
				}

				if (workerScope && userAgent != workerScope.userAgent) {
					lied = true // documented in the worker source
				}

				return userAgent.trim().replace(/\s{2,}/g, ' ')
			}, 'userAgent failed'),
			uaPostReduction: isUAPostReduction((navigator || {}).userAgent),
			appVersion: attempt(() => {
				const { appVersion } = navigator

				if (!credibleUserAgent) {
					sendToTrash('appVersion', `${appVersion} does not match userAgent`)
				}
				if ('appVersion' in navigator && !appVersion) {
					sendToTrash('appVersion', 'Living Standard property returned falsy value')
				}
				if (/\s{2,}|^\s|\s$/g.test(appVersion)) {
					sendToTrash('appVersion', `extra spaces detected`)
				}

				return appVersion.trim().replace(/\s{2,}/g, ' ')
			}, 'appVersion failed'),
			deviceMemory: attempt(() => {
				if (!('deviceMemory' in navigator)) {
					return undefined
				}

				const { deviceMemory } = extendedNavigator
				if (typeof deviceMemory != 'number') return undefined
				const trusted = new Set([0.25, 0.5, 1, 2, 4, 8, 16, 32])
				if (!trusted.has(deviceMemory)) {
					sendToTrash('deviceMemory', `${deviceMemory} is not a valid value [0.25, 0.5, 1, 2, 4, 8, 16, 32]`)
				}

				const memory =
					(
						performance as Performance & {
							memory?: { jsHeapSizeLimit?: number }
						}
					).memory?.jsHeapSizeLimit || null
				const memoryInGigabytes = memory ? +(memory / 1073741824).toFixed(1) : 0
				if (memoryInGigabytes > deviceMemory) {
					sendToTrash(
						'deviceMemory',
						`available memory ${memoryInGigabytes}GB is greater than device memory ${deviceMemory}GB`,
					)
				}

				if (workerScope && deviceMemory !== workerScope.deviceMemory) {
					lied = true // documented in the worker source
				}

				return deviceMemory
			}, 'deviceMemory failed'),
			doNotTrack: attempt(() => {
				const { doNotTrack } = navigator
				const trusted = new Set(['1', 'true', 'yes', '0', 'false', 'no', 'unspecified', 'null', 'undefined'])
				if (!trusted.has(String(doNotTrack))) {
					sendToTrash('doNotTrack - unusual result', doNotTrack)
				}
				return doNotTrack
			}, 'doNotTrack failed'),
			globalPrivacyControl: attempt(() => {
				if (!('globalPrivacyControl' in navigator)) {
					return undefined
				}
				const { globalPrivacyControl } = extendedNavigator
				const trusted = new Set(['1', 'true', 'yes', '0', 'false', 'no', 'unspecified', 'null', 'undefined'])
				if (!trusted.has(String(globalPrivacyControl))) {
					sendToTrash('globalPrivacyControl - unusual result', globalPrivacyControl)
				}
				return globalPrivacyControl
			}, 'globalPrivacyControl failed'),
			hardwareConcurrency: attempt(() => {
				if (!('hardwareConcurrency' in navigator)) {
					return undefined
				}

				const { hardwareConcurrency } = navigator

				if (workerScope && hardwareConcurrency !== workerScope.hardwareConcurrency) {
					lied = true // documented in the worker source
				}

				return hardwareConcurrency
			}, 'hardwareConcurrency failed'),
			language: languageData?.language,
			languages: languageData?.languages,
			maxTouchPoints: attempt(() => {
				if (!('maxTouchPoints' in navigator)) {
					return null
				}
				return navigator.maxTouchPoints
			}, 'maxTouchPoints failed'),
			vendor: attempt(() => navigator.vendor, 'vendor failed'),
			mimeTypes: attempt(() => {
				const { mimeTypes } = navigator
				return mimeTypes ? [...mimeTypes].map((m) => m.type) : []
			}, 'mimeTypes failed'),
			oscpu: attempt(() => extendedNavigator.oscpu, 'oscpu failed'),
			plugins: attempt(() => {
				// https://html.spec.whatwg.org/multipage/system-state.html#pdf-viewing-support
				const { plugins } = navigator
				if (!(plugins instanceof PluginArray)) {
					return
				}
				const response = plugins
					? [...plugins].map((p) => ({
							name: p.name,
							description: p.description,
							filename: p.filename,
							version: (p as Plugin & { version?: string }).version,
						}))
					: []

				const { lies } = getPluginLies(plugins, navigator.mimeTypes)
				if (lies.length) {
					lied = true
					lies.forEach((lie) => {
						return documentLie(`Navigator.plugins`, lie)
					})
				}

				if (response.length) {
					response.forEach((plugin) => {
						const { name, description } = plugin
						const nameGibbers = gibberish(name)
						const descriptionGibbers = gibberish(description)
						if (nameGibbers.length) {
							sendToTrash(`plugin name is gibberish`, name)
						}
						if (descriptionGibbers.length) {
							sendToTrash(`plugin description is gibberish`, description)
						}
						return
					})
				}
				return response
			}, 'plugins failed'),
			properties: attempt(() => {
				const keys = Object.keys(Object.getPrototypeOf(navigator))
				return keys
			}, 'navigator keys failed'),
		}

		const getUserAgentData = () =>
			attempt(() => {
				const userAgentData = extendedNavigator.userAgentData
				if (!userAgentData || typeof userAgentData.getHighEntropyValues != 'function') {
					return
				}
				return userAgentData
					.getHighEntropyValues([
						'platform',
						'platformVersion',
						'architecture',
						'bitness',
						'model',
						'uaFullVersion',
					])
					.then((rawData) => {
						const { brands, mobile } = userAgentData
						const compressedBrands = (
							brandList: readonly UserAgentBrand[] = [],
							captureVersion: boolean = false,
						) =>
							brandList
								.filter((obj) => !/Not/.test(obj.brand))
								.map((obj) => `${obj.brand}${captureVersion ? ` ${obj.version}` : ''}`)
						const removeChromium = (brandList: string[]) =>
							brandList.length > 1 ? brandList.filter((brand) => !/Chromium/.test(brand)) : brandList

						// compress brands
						const resolvedBrands = Array.isArray(rawData.brands)
							? rawData.brands
							: Array.isArray(brands)
								? brands
								: []
						const data: Record<string, unknown> = { ...rawData }
						const brandsVersion = compressedBrands(resolvedBrands, true)
						const brandsWithoutVersions = compressedBrands(resolvedBrands)
						data.brandsVersion = removeChromium(brandsVersion)
						data.brands = removeChromium(brandsWithoutVersions)

						if (data.mobile === undefined) data.mobile = mobile
						const dataSorted = Object.keys(data)
							.sort()
							.reduce<Record<string, unknown>>((acc, key) => {
								acc[key] = data[key]
								return acc
							}, {})
						return dataSorted
					})
			}, 'userAgentData failed')

		const getBluetoothAvailability = () =>
			attempt(() => {
				const bluetooth = extendedNavigator.bluetooth
				if (!bluetooth || typeof bluetooth.getAvailability != 'function') {
					return undefined
				}
				return bluetooth.getAvailability()
			}, 'bluetoothAvailability failed')

		const getPermissions = () =>
			attempt(() => {
				if (typeof navigator.permissions?.query != 'function') return undefined
				const getPermissionState = (name: string) =>
					settleAsyncSignal(
						Promise.resolve()
							.then(
								() =>
									Reflect.apply(navigator.permissions.query, navigator.permissions, [
										{ name },
									]) as Promise<PermissionStatus>,
							)
							.then((res) => ({ name, state: res.state })),
						{ name, state: 'unknown' },
					)

				// https://w3c.github.io/permissions/#permission-registry
				const permissions = Promise.all([
					getPermissionState('accelerometer'),
					getPermissionState('ambient-light-sensor'),
					getPermissionState('background-fetch'),
					getPermissionState('background-sync'),
					getPermissionState('bluetooth'),
					getPermissionState('camera'),
					getPermissionState('clipboard'),
					getPermissionState('device-info'),
					getPermissionState('display-capture'),
					getPermissionState('gamepad'),
					getPermissionState('geolocation'),
					getPermissionState('gyroscope'),
					getPermissionState('magnetometer'),
					getPermissionState('microphone'),
					getPermissionState('midi'),
					getPermissionState('nfc'),
					getPermissionState('notifications'),
					getPermissionState('persistent-storage'),
					getPermissionState('push'),
					getPermissionState('screen-wake-lock'),
					getPermissionState('speaker'),
					getPermissionState('speaker-selection'),
				])
					.then((permissions) =>
						permissions.reduce<Record<string, string[]>>((acc, perm) => {
							const { state, name } = perm
							if (acc[state]) {
								acc[state].push(name)
								return acc
							}
							acc[state] = [name]
							return acc
						}, {}),
					)
					.catch((error) => captureError(error, 'permissions failed'))
				return permissions
			}, 'permissions failed')

		const getWebGpu = () =>
			attempt(() => {
				const gpu = (extendedNavigator as NavigatorExtensions).gpu
				if (!gpu || typeof gpu.requestAdapter != 'function') {
					return
				}
				return gpu.requestAdapter().then((adapter) => {
					if (!adapter) return
					const { limits = {}, features = [] } = adapter
					const handleInfo = (info: GPUAdapterInfoLike = {}) => {
						const { architecture, description, device, vendor } = info
						const adapterInfo = [vendor, architecture, description, device]
						const featureValues = [...features.values()]
						const limitsData = ((limits) => {
							const data: Record<string, number> = {}
							// eslint-disable-next-line guard-for-in
							for (const prop in limits) {
								const value = limits[prop]
								if (typeof value == 'number') data[prop] = value
							}
							return data
						})(limits)

						return {
							analysis: {
								adapter: adapterInfo,
								features: featureValues,
								limits: hashMini(limitsData),
							},
							data: {
								adapterInfo,
								limits: limitsData,
							},
						}
					}
					const { info } = adapter
					return info
						? handleInfo(info)
						: typeof adapter.requestAdapterInfo == 'function'
							? adapter.requestAdapterInfo().then(handleInfo)
							: handleInfo()
				})
			}, 'webgpu failed')

		await queueEvent(timer)
		const [userAgentData, bluetoothAvailability, permissions, webgpuResult] = await Promise.all([
			settleAsyncSignal(getUserAgentData(), undefined),
			settleAsyncSignal(getBluetoothAvailability(), undefined),
			getPermissions(),
			settleAsyncSignal(getWebGpu(), undefined),
		])
		const { analysis: webGpuAnalysis, data: webgpu } = webgpuResult ?? {}
		if (webGpuAnalysis) {
			Analysis.webGpuAdapter = webGpuAnalysis.adapter
			Analysis.webGpuFeatures = webGpuAnalysis.features
			Analysis.webGpuLimits = webGpuAnalysis.limits
		}
		logTestResult({ time: timer.stop(), test: 'navigator', passed: true })
		return {
			...data,
			userAgentData,
			bluetoothAvailability,
			permissions,
			webgpu,
			lied,
		}
	} catch (error) {
		logTestResult({ test: 'navigator', passed: false })
		captureError(error, 'Navigator failed or blocked by client')
		throw error
	}
}
