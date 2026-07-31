/* eslint-disable new-cap */
import { captureError } from '../errors'
import { lieProps } from '../lies'
import { instanceId } from '../utils/crypto'
import { createTimer, queueEvent, IS_BLINK, logTestResult } from '../utils/helpers'

import getPlatformEstimate from './getPlatformEstimate'
import { getSystemFonts } from './getSystemFonts'

interface HeadlessInput {
	webgl?: {
		parameters?: Record<string, unknown>
	}
	workerScope?: {
		userAgent?: string
		webglRenderer?: string
	}
}

interface UserAgentDataLike {
	platform?: unknown
	getHighEntropyValues?: (hints: string[]) => Promise<Record<string, unknown>>
}

const isObjectLike = (value: unknown): value is object =>
	value !== null && (typeof value == 'object' || typeof value == 'function')

const readProperty = (target: unknown, key: PropertyKey): unknown => {
	try {
		return isObjectLike(target) ? Reflect.get(target, key) : undefined
	} catch {
		return undefined
	}
}

const getErrorName = (error: unknown): string | undefined => {
	const name = readProperty(error, 'name')
	return typeof name == 'string' ? name : undefined
}

const getUserAgentData = (): UserAgentDataLike | undefined => {
	const value = readProperty(navigator, 'userAgentData')
	return isObjectLike(value) ? (value as UserAgentDataLike) : undefined
}

const settleWithin = <T>(operation: PromiseLike<T>, fallback: T, limit: number = 3000): Promise<T> =>
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

const isUserAgentDataBlank = async (userAgentData: UserAgentDataLike | undefined): Promise<boolean> => {
	if (!userAgentData) return false
	if (userAgentData.platform === '') return true
	const getHighEntropyValues = userAgentData.getHighEntropyValues
	if (typeof getHighEntropyValues != 'function') return false
	const result = await settleWithin(
		Promise.resolve().then(
			() =>
				Reflect.apply(getHighEntropyValues, userAgentData, [['platform']]) as Promise<Record<string, unknown>>,
		),
		{},
	)
	return result.platform === ''
}

const supportsCSS = (condition: string): boolean => {
	try {
		return typeof globalThis.CSS?.supports == 'function' && CSS.supports(condition)
	} catch {
		return false
	}
}

const hasBadChromeRuntime = (): boolean => {
	const chrome = readProperty(window, 'chrome')
	const runtime = readProperty(chrome, 'runtime')
	if (!isObjectLike(runtime)) return false
	for (const methodName of ['sendMessage', 'connect']) {
		const method = readProperty(runtime, methodName)
		if (typeof method != 'function') return false
		try {
			if (Reflect.has(method, 'prototype')) return true
			Reflect.construct(Object, [], method)
			return true
		} catch (error) {
			if (getErrorName(error) != 'TypeError') return true
		}
	}
	return false
}

export default async function getHeadlessFeatures({ webgl, workerScope }: HeadlessInput) {
	try {
		const timer = createTimer()
		await queueEvent(timer)
		const mimeTypes = Object.keys({ ...navigator.mimeTypes })

		const systemFonts = getSystemFonts()
		const platformEstimate = getPlatformEstimate()
		const [scores, highestScore, headlessEstimate] = platformEstimate

		interface Headless {
			chromium: boolean
			likeHeadless: Record<string, boolean>
			headless: Record<string, boolean>
			stealth: Record<string, boolean>
		}
		const notificationConstructor = readProperty(window, 'Notification')
		const notificationPermission = readProperty(notificationConstructor, 'permission')
		const userAgentData = getUserAgentData()
		const uaDataIsBlank = await isUserAgentDataBlank(userAgentData)
		const data: Headless = {
			chromium: IS_BLINK,
			likeHeadless: {
				noChrome: IS_BLINK && !('chrome' in window),
				hasPermissionsBug:
					IS_BLINK &&
					'permissions' in navigator &&
					(await settleWithin(
						(async () => {
							const res = await navigator.permissions.query({
								name: 'notifications',
							})
							return (
								res.state == 'prompt' &&
								isObjectLike(notificationConstructor) &&
								notificationPermission === 'denied'
							)
						})(),
						false,
					)),
				noPlugins: IS_BLINK && navigator.plugins.length === 0,
				noMimeTypes: IS_BLINK && mimeTypes.length === 0,
				notificationIsDenied:
					IS_BLINK && isObjectLike(notificationConstructor) && notificationPermission == 'denied',
				hasKnownBgColor:
					IS_BLINK &&
					(() => {
						const rendered = document.createElement('div')
						rendered.setAttribute('style', 'position: absolute; left: -10000px; visibility: hidden;')
						document.body.appendChild(rendered)
						try {
							rendered.style.backgroundColor = 'ActiveText'
							const activeText =
								rendered.ownerDocument.defaultView?.getComputedStyle(rendered).backgroundColor
							return activeText === 'rgb(255, 0, 0)'
						} finally {
							rendered.remove()
						}
					})(),
				prefersLightColor: (() => {
					try {
						return matchMedia('(prefers-color-scheme: light)').matches
					} catch {
						return false
					}
				})(),
				uaDataIsBlank,
				pdfIsDisabled: 'pdfViewerEnabled' in navigator && navigator.pdfViewerEnabled === false,
				noTaskbar: screen.height === screen.availHeight && screen.width === screen.availWidth,
				hasVvpScreenRes:
					(innerWidth === screen.width && outerHeight === screen.height) ||
					('visualViewport' in window &&
						window.visualViewport?.width === screen.width &&
						window.visualViewport?.height === screen.height),
				hasSwiftShader: /SwiftShader/.test(workerScope?.webglRenderer ?? ''),
				noWebShare:
					IS_BLINK &&
					supportsCSS('accent-color: initial') &&
					(!('share' in navigator) || !('canShare' in navigator)),
				noContentIndex: !!headlessEstimate?.noContentIndex,
				noContactsManager: !!headlessEstimate?.noContactsManager,
				noDownlinkMax: !!headlessEstimate?.noDownlinkMax,
			},
			headless: {
				webDriverIsOn:
					(supportsCSS('border-end-end-radius: initial') && navigator.webdriver === undefined) ||
					!!navigator.webdriver ||
					!!lieProps['Navigator.webdriver'],
				hasHeadlessUA:
					/HeadlessChrome/.test(navigator.userAgent) || /HeadlessChrome/.test(navigator.appVersion),
				hasHeadlessWorkerUA: !!workerScope && /HeadlessChrome/.test(workerScope.userAgent ?? ''),
			},
			stealth: {
				hasIframeProxy: (() => {
					try {
						const iframe = document.createElement('iframe')
						iframe.srcdoc = instanceId
						return !!iframe.contentWindow
					} catch {
						return true
					}
				})(),
				hasHighChromeIndex: (() => {
					const key = 'chrome'
					const highIndexRange = -50
					return (
						Object.keys(window).slice(highIndexRange).includes(key) &&
						Object.getOwnPropertyNames(window).slice(highIndexRange).includes(key)
					)
				})(),
				hasBadChromeRuntime: hasBadChromeRuntime(),
				hasToStringProxy: !!lieProps['Function.toString'],
				hasBadWebGL: (() => {
					const { UNMASKED_RENDERER_WEBGL: gpu } = webgl?.parameters || {}
					const { webglRenderer: workerGPU } = workerScope || {}
					return !!(gpu && workerGPU && gpu !== workerGPU)
				})(),
			},
		}

		const { likeHeadless, headless, stealth } = data
		const getRating = (values: Record<string, boolean>) => {
			const flags = Object.values(values)
			return +((flags.filter(Boolean).length / flags.length) * 100).toFixed(0)
		}
		const likeHeadlessRating = getRating(likeHeadless)
		const headlessRating = getRating(headless)
		const stealthRating = getRating(stealth)

		logTestResult({ time: timer.stop(), test: 'headless', passed: true })
		return {
			...data,
			likeHeadlessRating,
			headlessRating,
			stealthRating,
			systemFonts,
			platformEstimate: scores === undefined ? [] : [scores, highestScore],
		}
	} catch (error) {
		logTestResult({ test: 'headless', passed: false })
		captureError(error)
		throw error
	}
}
