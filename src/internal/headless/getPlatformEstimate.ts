import { IS_BLINK } from '../utils/helpers'
import { Platform } from './constants'

export default function getPlatformEstimate():
	[scores: Record<string, number>, highestScore: number, headlessEstimate: Record<string, boolean>] | [] {
	if (!IS_BLINK) return []
	const isObjectLike = (value: unknown): value is object | ((...args: never[]) => unknown) =>
		value !== null && (typeof value == 'object' || typeof value == 'function')
	const safeRead = (target: unknown, key: PropertyKey): unknown => {
		try {
			return isObjectLike(target) ? Reflect.get(target, key) : undefined
		} catch {
			return undefined
		}
	}
	const safeHas = (target: unknown, key: PropertyKey): boolean => {
		try {
			return isObjectLike(target) && Reflect.has(target, key)
		} catch {
			return false
		}
	}
	const getPrototype = (constructorName: PropertyKey): unknown =>
		safeRead(safeRead(globalThis, constructorName), 'prototype')
	const supports = (condition: string): boolean => {
		try {
			return typeof globalThis.CSS?.supports == 'function' && CSS.supports(condition)
		} catch {
			return false
		}
	}
	const v80 = safeHas(getPrototype('HTMLVideoElement'), 'getVideoPlaybackQuality')
	const v81 = supports('color-scheme: initial')
	const v84 = supports('appearance: initial')
	const v86 = safeHas(globalThis.Intl, 'DisplayNames')
	const v88 = supports('aspect-ratio: initial')
	const v89 = supports('border-end-end-radius: initial')
	const v95 = safeHas(getPrototype('Crypto'), 'randomUUID')
	const hasBarcodeDetector = safeHas(window, 'BarcodeDetector')
	const hasDownlinkMax = safeHas(getPrototype('NetworkInformation'), 'downlinkMax')
	const hasContentIndex = safeHas(window, 'ContentIndex')
	const hasContactsManager = safeHas(window, 'ContactsManager')
	const hasEyeDropper = safeHas(window, 'EyeDropper')
	const hasFileSystemWritableFileStream = safeHas(window, 'FileSystemWritableFileStream')
	const hasHid = safeHas(window, 'HID') && safeHas(window, 'HIDDevice')
	const hasSerialPort = safeHas(window, 'SerialPort') && safeHas(window, 'Serial')
	const hasSharedWorker = safeHas(window, 'SharedWorker')
	const maxTouchPoints = safeRead(navigator, 'maxTouchPoints')
	const hasTouch = safeHas(window, 'ontouchstart') || (typeof maxTouchPoints == 'number' && maxTouchPoints > 0)
	const hasAppBadge = safeHas(getPrototype('Navigator'), 'setAppBadge')
	const acceptsEitherTouchState = true

	const hasFeature = (version: boolean, condition: boolean): boolean[] => (version ? [condition] : [])
	const estimate: Record<string, boolean[]> = {
		[Platform.ANDROID]: [
			...hasFeature(v88, hasBarcodeDetector),
			...hasFeature(v84, hasContentIndex),
			...hasFeature(v80, hasContactsManager),
			hasDownlinkMax,
			...hasFeature(v95, !hasEyeDropper),
			...hasFeature(v86, !hasFileSystemWritableFileStream),
			...hasFeature(v89, !hasHid),
			...hasFeature(v89, !hasSerialPort),
			!hasSharedWorker,
			hasTouch,
			...hasFeature(v81, !hasAppBadge),
		],
		[Platform.CHROME_OS]: [
			...hasFeature(v88, hasBarcodeDetector),
			...hasFeature(v84, !hasContentIndex),
			...hasFeature(v80, !hasContactsManager),
			hasDownlinkMax,
			...hasFeature(v95, hasEyeDropper),
			...hasFeature(v86, hasFileSystemWritableFileStream),
			...hasFeature(v89, hasHid),
			...hasFeature(v89, hasSerialPort),
			hasSharedWorker,
			acceptsEitherTouchState,
			...hasFeature(v81, !hasAppBadge),
		],
		[Platform.WINDOWS]: [
			...hasFeature(v88, !hasBarcodeDetector),
			...hasFeature(v84, !hasContentIndex),
			...hasFeature(v80, !hasContactsManager),
			!hasDownlinkMax,
			...hasFeature(v95, hasEyeDropper),
			...hasFeature(v86, hasFileSystemWritableFileStream),
			...hasFeature(v89, hasHid),
			...hasFeature(v89, hasSerialPort),
			hasSharedWorker,
			acceptsEitherTouchState,
			...hasFeature(v81, hasAppBadge),
		],
		[Platform.MAC]: [
			...hasFeature(v88, hasBarcodeDetector),
			...hasFeature(v84, !hasContentIndex),
			...hasFeature(v80, !hasContactsManager),
			!hasDownlinkMax,
			...hasFeature(v95, hasEyeDropper),
			...hasFeature(v86, hasFileSystemWritableFileStream),
			...hasFeature(v89, hasHid),
			...hasFeature(v89, hasSerialPort),
			hasSharedWorker,
			!hasTouch,
			...hasFeature(v81, hasAppBadge),
		],
		[Platform.LINUX]: [
			...hasFeature(v88, !hasBarcodeDetector),
			...hasFeature(v84, !hasContentIndex),
			...hasFeature(v80, !hasContactsManager),
			!hasDownlinkMax,
			...hasFeature(v95, hasEyeDropper),
			...hasFeature(v86, hasFileSystemWritableFileStream),
			...hasFeature(v89, hasHid),
			...hasFeature(v89, hasSerialPort),
			hasSharedWorker,
			!hasTouch,
			...hasFeature(v81, !hasAppBadge),
		],
	}

	// Chrome only features
	const headlessEstimate: Record<string, boolean> = {
		noContentIndex: v84 && !hasContentIndex,
		noContactsManager: v80 && !hasContactsManager,
		noDownlinkMax: !hasDownlinkMax,
	}

	const scores = Object.fromEntries(
		Object.entries(estimate).map(([key, list]) => [key, +(list.filter(Boolean).length / list.length).toFixed(2)]),
	)
	const highestScore = Math.max(...Object.values(scores))

	return [scores, highestScore, headlessEstimate]
}
