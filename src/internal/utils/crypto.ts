import { isFontOSBad } from './fonts'
import { getReportedPlatform, type WindowsReleaseInput } from './helpers'
import { BOT_RULE_NAMES, type BotDetectionResult, type BotRule, type UserAgentData } from '../../types'

// https://stackoverflow.com/a/22429679
const hashMini = (value: unknown): string => {
	const json = `${JSON.stringify(value)}`
	const hash = json.split('').reduce((hash, _char, i) => {
		return Math.imul(31, hash) + json.charCodeAt(i) | 0
	}, 0x811c9dc5)
	return ('0000000' + (hash >>> 0).toString(16)).substr(-8)
}

// instance id
const instanceId = (
	String.fromCharCode(Math.random() * 26 + 97) +
	Math.random().toString(36).slice(-7)
)

// https://stackoverflow.com/a/53490958
// https://stackoverflow.com/a/43383990
// https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest
const hashify = (value: unknown, algorithm: AlgorithmIdentifier = 'SHA-256'): Promise<string> => {
	// The fuzzy fingerprint is a separate, compatibility-sensitive algorithm.
	// Keep its legacy JSON encoding; public component hashes use canonical hashValue.
	const json = `${JSON.stringify(value)}`
	const jsonBuffer = new TextEncoder().encode(json)
	return crypto.subtle.digest(algorithm, jsonBuffer).then((hashBuffer) => {
		const hashArray = Array.from(new Uint8Array(hashBuffer))
		const hashHex = hashArray.map((b) => ('00' + b.toString(16)).slice(-2)).join('')
		return hashHex
	})
}

interface BotFingerprint {
	workerScope?: {
		userAgent?: string
		lied?: unknown
		userAgentData?: UserAgentData
	}
	fonts?: {
		platformVersion?: string
		fontFaceLoadFonts?: readonly string[]
	}
	lies?: { totalLies?: number }
	headless?: { stealth?: Readonly<Record<string, unknown>> }
	resistance?: { privacy?: string }
	features?: { cssVersion?: string; jsVersion?: string }
}

interface BotDetectionImports {
	getFeaturesLie(fp: BotFingerprint): boolean
	computeWindowsRelease(input: WindowsReleaseInput): string | undefined
}

const getBotDetection = (fp: BotFingerprint, imports: BotDetectionImports): BotDetectionResult => {
	const { getFeaturesLie, computeWindowsRelease } = imports
	const outsideFeaturesVersion = getFeaturesLie(fp)
	const workerScopeIsBlocked = (
		!fp.workerScope ||
		!fp.workerScope.userAgent
	)
	const liedWorkerScope = !!(fp.workerScope && fp.workerScope.lied)
	let liedPlatformVersion = false
	if (fp.workerScope && fp.fonts) {
		const { platformVersion, platform } = fp.workerScope.userAgentData || {}
		const { platformVersion: fontPlatformVersion } = fp.fonts || {}
		const windowsRelease = computeWindowsRelease({
			platform,
			platformVersion,
			fontPlatformVersion,
		})

		const windowsPlatformVersionLie = !!(
			windowsRelease &&
			fontPlatformVersion &&
			!(''+windowsRelease).includes(fontPlatformVersion)
		)
		// use font platform (window scope) to detect userAgent (worker scope) lies
		const macOrWindowsPlatformVersionLie = !!(
			typeof fontPlatformVersion == 'string' && /macOS|Windows/.test(fontPlatformVersion) &&
			(platform && !fontPlatformVersion.includes(platform))
		)
		liedPlatformVersion = (
			windowsPlatformVersionLie ||
			macOrWindowsPlatformVersionLie
		)
	}

	const { totalLies } = fp.lies || {}
	const { fontFaceLoadFonts } = fp.fonts || {}
	const { userAgent } = fp.workerScope || {}
	const { stealth } = fp.headless || {}
	const [workerUserAgentOS] = userAgent ? getReportedPlatform(userAgent) : []
	const maxLieCount = 100
	const extremeLieCount = (
		isFontOSBad(workerUserAgentOS, fontFaceLoadFonts) ||
		((totalLies || 0) > maxLieCount) ||
		Object.values(stealth || {}).some((x) => x === true) // stealth lies are severe
	)
	const functionToStringHasProxy = (
		!!stealth?.hasToStringProxy
	)

	// Pattern conditions that warrant rejection
	const botPatterns = {
		// custom order is important
		liedWorkerScope, // lws
		liedPlatformVersion, // lpv
		functionToStringHasProxy, // ftp
		outsideFeaturesVersion, // ofv
		extremeLieCount, // elc
		excessiveLooseFingerprints: false, // elf (compute on server)
		workerScopeIsBlocked, // wsb
		crowdBlendingScoreIsLow: false, // csl
	} satisfies Record<BotRule, boolean>

	const botMask = BOT_RULE_NAMES
		.map((key) => botPatterns[key] ? '1' : '0').join('')
	const firstMatchedRule = BOT_RULE_NAMES.find((key) => botPatterns[key])
	return {
		botMask,
		...(firstMatchedRule ? { firstMatchedRule } : {}),
	}
}

// Requires updating the development log below when keys are added to the fingerprint.
const FUZZY_METRIC_KEYS: readonly string[] = Object.freeze([
		'canvas2d.dataURI',
		'canvas2d.emojiSet',
		'canvas2d.emojiURI',
		'canvas2d.liedTextMetrics',
		'canvas2d.mods',
		'canvas2d.paintURI',
		'canvas2d.paintCpuURI',
		'canvas2d.textMetricsSystemSum',
		'canvas2d.textURI',
		'canvasWebgl.dataURI',
		'canvasWebgl.dataURI2',
		'canvasWebgl.extensions',
		'canvasWebgl.gpu',
		'canvasWebgl.parameterOrExtensionLie',
		'canvasWebgl.parameters',
		'canvasWebgl.pixels',
		'canvasWebgl.pixels2',
		'capturedErrors.data',
		'clientRects.domrectSystemSum',
		'clientRects.elementBoundingClientRect',
		'clientRects.elementClientRects',
		'clientRects.emojiSet',
		'clientRects.rangeBoundingClientRect',
		'clientRects.rangeClientRects',
		'consoleErrors.errors',
		'css.computedStyle',
		'css.system',
		'cssMedia.matchMediaCSS',
		'cssMedia.mediaCSS',
		'cssMedia.screenQuery',
		'features.cssFeatures',
		'features.cssVersion',
		'features.jsFeatures',
		'features.jsFeaturesKeys',
		'features.jsVersion',
		'features.version',
		'features.versionRange',
		'features.windowFeatures',
		'features.windowVersion',
		'fonts.apps',
		'fonts.emojiSet',
		'fonts.fontFaceLoadFonts',
		'fonts.pixelSizeSystemSum',
		'fonts.platformVersion',
		'headless.chromium',
		'headless.headless',
		'headless.headlessRating',
		'headless.likeHeadless',
		'headless.likeHeadlessRating',
		'headless.platformEstimate',
		'headless.stealth',
		'headless.stealthRating',
		'headless.systemFonts',
		'htmlElementVersion.keys',
		'intl.dateTimeFormat',
		'intl.displayNames',
		'intl.listFormat',
		'intl.locale',
		'intl.numberFormat',
		'intl.pluralRules',
		'intl.relativeTimeFormat',
		'lies.data',
		'lies.totalLies',
		'maths.data',
		'media.mimeTypes',
		'navigator.appVersion',
		'navigator.bluetoothAvailability',
		'navigator.device',
		'navigator.deviceMemory',
		'navigator.doNotTrack',
		'navigator.globalPrivacyControl',
		'navigator.hardwareConcurrency',
		'navigator.language',
		'navigator.maxTouchPoints',
		'navigator.mimeTypes',
		'navigator.oscpu',
		'navigator.permissions',
		'navigator.platform',
		'navigator.plugins',
		'navigator.properties',
		'navigator.system',
		'navigator.uaPostReduction',
		'navigator.userAgent',
		'navigator.userAgentData',
		'navigator.userAgentParsed',
		'navigator.vendor',
		'navigator.webgpu',
		'offlineAudioContext.binsSample',
		'offlineAudioContext.compressorGainReduction',
		'offlineAudioContext.copySample',
		'offlineAudioContext.floatFrequencyDataSum',
		'offlineAudioContext.floatTimeDomainDataSum',
		'offlineAudioContext.noise',
		'offlineAudioContext.sampleSum',
		'offlineAudioContext.totalUniqueSamples',
		'offlineAudioContext.values',
		'resistance.engine',
		'resistance.extension',
		'resistance.extensionHashPattern',
		'resistance.mode',
		'resistance.privacy',
		'resistance.security',
		'screen.availHeight',
		'screen.availWidth',
		'screen.colorDepth',
		'screen.height',
		'screen.pixelDepth',
		'screen.touch',
		'screen.width',
		'svg.bBox',
		'svg.computedTextLength',
		'svg.emojiSet',
		'svg.extentOfChar',
		'svg.subStringLength',
		'svg.svgrectSystemSum',
		'timezone.location',
		'timezone.locationEpoch',
		'timezone.locationMeasured',
		'timezone.offset',
		'timezone.offsetComputed',
		'timezone.zone',
		'trash.trashBin',
		'voices.defaultVoiceLang',
		'voices.defaultVoiceName',
		'voices.languages',
		'voices.local',
		'voices.remote',
		'windowFeatures.apple',
		'windowFeatures.keys',
		'windowFeatures.moz',
		'windowFeatures.webkit',
		'workerScope.device',
		'workerScope.deviceMemory',
		'workerScope.engineCurrencyLocale',
		'workerScope.gpu',
		'workerScope.hardwareConcurrency',
		'workerScope.language',
		'workerScope.languages',
		'workerScope.lies',
		'workerScope.locale',
		'workerScope.localeEntropyIsTrusty',
		'workerScope.localeIntlEntropyIsTrusty',
		'workerScope.platform',
		'workerScope.system',
		'workerScope.systemCurrencyLocale',
		'workerScope.timezoneLocation',
		'workerScope.timezoneOffset',
		'workerScope.uaPostReduction',
		'workerScope.userAgent',
		'workerScope.userAgentData',
		'workerScope.userAgentDataVersion',
		'workerScope.userAgentEngine',
		'workerScope.userAgentVersion',
		'workerScope.webglRenderer',
		'workerScope.webglVendor',
	])

const partitionFuzzyMetricKeys = (metricKeys: readonly string[] = FUZZY_METRIC_KEYS, maxBins = 64): string[][] => {
	const safeMaxBins = Number.isFinite(maxBins) ? Math.max(0, Math.floor(maxBins)) : 0
	const binCount = Math.min(metricKeys.length, safeMaxBins)
	if (!binCount) return []
	return Array.from({ length: binCount }, (_, index) => {
		const start = Math.floor(index * metricKeys.length / binCount)
		const end = Math.floor((index + 1) * metricKeys.length / binCount)
		return metricKeys.slice(start, end)
	})
}

const getFuzzyHash = async (fp: object): Promise<string> => {
	const metricKeys = FUZZY_METRIC_KEYS
	// construct map of all metrics
	const metricsAll: Record<string, unknown> = {}
	for (const [sectionKey, section] of Object.entries(fp).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
		if (section == null || (typeof section != 'object' && typeof section != 'function')) continue
		for (const key of Object.keys(section).sort()) {
			if (key == '$hash' || key == 'lied') continue
			metricsAll[`${sectionKey}.${key}`] = Reflect.get(section, key)
		}
	}

	// reduce to 64 bins
	const maxBins = 64
	const metricKeysReported = Object.keys(metricsAll)
	const metricKeyBins = partitionFuzzyMetricKeys(metricKeys, maxBins)

	// update log
	const devMode = false
	if (devMode && (''+metricKeysReported != ''+metricKeys)) {
		const newKeys = metricKeysReported.filter((key) => !metricKeys.includes(key))
		const oldKeys = metricKeys.filter((key) => !metricKeysReported.includes(key))

		if (newKeys.length || oldKeys.length) {
			if (newKeys.length) console.warn('added fuzzy key(s):\n', newKeys.join('\n'))
			if (oldKeys.length) console.warn('removed fuzzy key(s):\n', oldKeys.join('\n'))

			console.groupCollapsed('update keys for accurate fuzzy hashing:')
			console.log(metricKeysReported.map((x) => `'${x}',`).join('\n'))
			console.groupEnd()
		}
	}

	// Fuzzy IDs intentionally retain the upstream JSON hash. They use only the
	// first hex digit from each fixed metric bin and are not component identities.
	// Raw, focused, and stable component hashes use the canonical public hasher.
	const fuzzyFpMaster = await Promise.all(metricKeyBins.map((keySet) => (
		hashify(keySet.map((key) => metricsAll[key]))
	)))

	// create fuzzy hash
	const fuzzyBits = 64
	const fuzzyFingerprint = fuzzyFpMaster
		.map((hash) => hash[0])
		.join('')
		.padEnd(fuzzyBits, '0')

	return fuzzyFingerprint
}

export {
	FUZZY_METRIC_KEYS,
	getBotDetection,
	getFuzzyHash,
	hashMini,
	hashify,
	instanceId,
	partitionFuzzyMetricKeys,
}
