import { captureError } from '../errors'
import { PHANTOM_DARKNESS } from '../lies'
import { instanceId } from '../utils/crypto'

import { createTimer, logTestResult, LowerEntropy } from '../utils/helpers'
let probeSequence = 0

export default function getCSSMedia() {
	let probe: HTMLElement | undefined
	const gcd = (a: number, b: number): number => {
		while (b) {
			const remainder = a % b
			a = b
			b = remainder
		}
		return a
	}

	const getAspectRatio = (width: number, height: number): string | undefined => {
		if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return
		const r = gcd(width, height)
		if (!r) return
		const aspectRatio = `${width / r}/${height / r}`
		return aspectRatio
	}

	interface MediaQueryOptions {
		doc: Document
		win: Window
		probe: HTMLElement
		probeId: string
		type: 'width' | 'height'
		rangeStart: number
		rangeLen: number
	}
	const query = ({ doc, win, probe, probeId, type, rangeStart, rangeLen }: MediaQueryOptions): string => {
		const html = [...Array(rangeLen)].map((_, i) => {
			i += rangeStart
			return `@media(device-${type}:${i}px){#${probeId}{--device-${type}:${i};}}`
		}).join('')
		const stylesheet = doc.createElement('style')
		stylesheet.textContent = html
		probe.append(stylesheet)
		try {
			const style = win.getComputedStyle(probe)
			return style.getPropertyValue(`--device-${type}`).trim()
		} finally {
			stylesheet.remove()
		}
	}

	type ScreenMediaOptions = Omit<MediaQueryOptions, 'type' | 'rangeStart' | 'rangeLen'> & {
		width: number
		height: number
	}
	const getScreenMedia = ({ doc, win, probe, probeId, width, height }: ScreenMediaOptions) => {
		let widthMatch = query({ doc, win, probe, probeId, type: 'width', rangeStart: width, rangeLen: 1 })
		let heightMatch = query({ doc, win, probe, probeId, type: 'height', rangeStart: height, rangeLen: 1 })
		if (widthMatch && heightMatch) {
			return { width, height }
		}
		const rangeLen = 1000
		;[...Array(10)].find((_, i) => {
			if (!widthMatch) {
				widthMatch = query({ doc, win, probe, probeId, type: 'width', rangeStart: i * rangeLen, rangeLen })
			}
			if (!heightMatch) {
				heightMatch = query({ doc, win, probe, probeId, type: 'height', rangeStart: i * rangeLen, rangeLen })
			}
			return widthMatch && heightMatch
		})
		return { width: +widthMatch, height: +heightMatch }
	}

	try {
		const timer = createTimer()
		timer.start()
		const win = PHANTOM_DARKNESS || window

		const { document: doc } = win
		const { body } = doc
		const { width, availWidth, height, availHeight } = win.screen
		const probeId = `${instanceId}-css-media-${++probeSequence}`
		probe = doc.createElement('div')
		probe.id = probeId
		probe.setAttribute('aria-hidden', 'true')
		probe.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:0;height:0;pointer-events:none'
		body.append(probe)

		const noTaskbar = !(width - availWidth || height - availHeight)
		if (screen.width !== width || (width > 800 && noTaskbar)) {
			LowerEntropy.IFRAME_SCREEN = true
		}

		const deviceAspectRatio = getAspectRatio(width, height)

		const matchMediaCSS = {
			['prefers-reduced-motion']: (
				win.matchMedia('(prefers-reduced-motion: no-preference)').matches ? 'no-preference' :
					win.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'reduce' : undefined
			),
			['prefers-color-scheme']: (
				// prefer main window
				matchMedia('(prefers-color-scheme: light)').matches ? 'light' :
					matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : undefined
			),
			monochrome: (
				win.matchMedia('(monochrome)').matches ? 'monochrome' :
					win.matchMedia('(monochrome: 0)').matches ? 'non-monochrome' : undefined
			),
			['inverted-colors']: (
				win.matchMedia('(inverted-colors: inverted)').matches ? 'inverted' :
					win.matchMedia('(inverted-colors: none)').matches ? 'none' : undefined
			),
			['forced-colors']: (
				win.matchMedia('(forced-colors: none)').matches ? 'none' :
					win.matchMedia('(forced-colors: active)').matches ? 'active' : undefined
			),
			['any-hover']: (
				win.matchMedia('(any-hover: hover)').matches ? 'hover' :
					win.matchMedia('(any-hover: none)').matches ? 'none' : undefined
			),
			hover: (
				win.matchMedia('(hover: hover)').matches ? 'hover' :
					win.matchMedia('(hover: none)').matches ? 'none' : undefined
			),
			['any-pointer']: (
				win.matchMedia('(any-pointer: fine)').matches ? 'fine' :
					win.matchMedia('(any-pointer: coarse)').matches ? 'coarse' :
						win.matchMedia('(any-pointer: none)').matches ? 'none' : undefined
			),
			pointer: (
				win.matchMedia('(pointer: fine)').matches ? 'fine' :
					win.matchMedia('(pointer: coarse)').matches ? 'coarse' :
						win.matchMedia('(pointer: none)').matches ? 'none' : undefined
			),
			['device-aspect-ratio']: !deviceAspectRatio ? undefined : (
				win.matchMedia(`(device-aspect-ratio: ${deviceAspectRatio})`).matches ? deviceAspectRatio : undefined
			),
			['device-screen']: (
				win.matchMedia(`(device-width: ${width}px) and (device-height: ${height}px)`).matches ? `${width} x ${height}` : undefined
			),
			['display-mode']: (
				win.matchMedia('(display-mode: fullscreen)').matches ? 'fullscreen' :
					win.matchMedia('(display-mode: standalone)').matches ? 'standalone' :
						win.matchMedia('(display-mode: minimal-ui)').matches ? 'minimal-ui' :
							win.matchMedia('(display-mode: browser)').matches ? 'browser' : undefined
			),
			['color-gamut']: (
				win.matchMedia('(color-gamut: rec2020)').matches ? 'rec2020' :
					win.matchMedia('(color-gamut: p3)').matches ? 'p3' :
						win.matchMedia('(color-gamut: srgb)').matches ? 'srgb' : undefined
			),
			orientation: (
				// prefer main window
				matchMedia('(orientation: landscape)').matches ? 'landscape' :
					matchMedia('(orientation: portrait)').matches ? 'portrait' : undefined
			),
		}

		const stylesheet = doc.createElement('style')
		stylesheet.textContent = `
		@media (prefers-reduced-motion: no-preference) {#${probeId} {--prefers-reduced-motion: no-preference}}
		@media (prefers-reduced-motion: reduce) {#${probeId} {--prefers-reduced-motion: reduce}}
		@media (prefers-color-scheme: light) {#${probeId} {--prefers-color-scheme: light}}
		@media (prefers-color-scheme: dark) {#${probeId} {--prefers-color-scheme: dark}}
		@media (monochrome) {#${probeId} {--monochrome: monochrome}}
		@media (monochrome: 0) {#${probeId} {--monochrome: non-monochrome}}
		@media (inverted-colors: inverted) {#${probeId} {--inverted-colors: inverted}}
		@media (inverted-colors: none) {#${probeId} {--inverted-colors: none}}
		@media (forced-colors: none) {#${probeId} {--forced-colors: none}}
		@media (forced-colors: active) {#${probeId} {--forced-colors: active}}
		@media (any-hover: hover) {#${probeId} {--any-hover: hover}}
		@media (any-hover: none) {#${probeId} {--any-hover: none}}
		@media (hover: hover) {#${probeId} {--hover: hover}}
		@media (hover: none) {#${probeId} {--hover: none}}
		@media (any-pointer: fine) {#${probeId} {--any-pointer: fine}}
		@media (any-pointer: coarse) {#${probeId} {--any-pointer: coarse}}
		@media (any-pointer: none) {#${probeId} {--any-pointer: none}}
		@media (pointer: fine) {#${probeId} {--pointer: fine}}
		@media (pointer: coarse) {#${probeId} {--pointer: coarse}}
		@media (pointer: none) {#${probeId} {--pointer: none}}
		${deviceAspectRatio ? `@media (device-aspect-ratio: ${deviceAspectRatio}) {#${probeId} {--device-aspect-ratio: ${deviceAspectRatio}}}` : ''}
		@media (device-width: ${width}px) and (device-height: ${height}px) {#${probeId} {--device-screen: ${width} x ${height}}}
		@media (display-mode: fullscreen) {#${probeId} {--display-mode: fullscreen}}
		@media (display-mode: standalone) {#${probeId} {--display-mode: standalone}}
		@media (display-mode: minimal-ui) {#${probeId} {--display-mode: minimal-ui}}
		@media (display-mode: browser) {#${probeId} {--display-mode: browser}}
		@media (color-gamut: srgb) {#${probeId} {--color-gamut: srgb}}
		@media (color-gamut: p3) {#${probeId} {--color-gamut: p3}}
		@media (color-gamut: rec2020) {#${probeId} {--color-gamut: rec2020}}
		@media (orientation: landscape) {#${probeId} {--orientation: landscape}}
		@media (orientation: portrait) {#${probeId} {--orientation: portrait}}
		`
		probe.append(stylesheet)

		const style = win.getComputedStyle(probe)
		const mediaCSS = {
			['prefers-reduced-motion']: style.getPropertyValue('--prefers-reduced-motion').trim() || undefined,
			['prefers-color-scheme']: style.getPropertyValue('--prefers-color-scheme').trim() || undefined,
			monochrome: style.getPropertyValue('--monochrome').trim() || undefined,
			['inverted-colors']: style.getPropertyValue('--inverted-colors').trim() || undefined,
			['forced-colors']: style.getPropertyValue('--forced-colors').trim() || undefined,
			['any-hover']: style.getPropertyValue('--any-hover').trim() || undefined,
			hover: style.getPropertyValue('--hover').trim() || undefined,
			['any-pointer']: style.getPropertyValue('--any-pointer').trim() || undefined,
			pointer: style.getPropertyValue('--pointer').trim() || undefined,
			['device-aspect-ratio']: style.getPropertyValue('--device-aspect-ratio').trim() || undefined,
			['device-screen']: style.getPropertyValue('--device-screen').trim() || undefined,
			['display-mode']: style.getPropertyValue('--display-mode').trim() || undefined,
			['color-gamut']: style.getPropertyValue('--color-gamut').trim() || undefined,
			orientation: style.getPropertyValue('--orientation').trim() || undefined,
		}

		// get screen query
		const screenQuery = getScreenMedia({ doc, win, probe, probeId, width, height })

		logTestResult({ time: timer.stop(), test: 'css media', passed: true })
		return { mediaCSS, matchMediaCSS, screenQuery }
	} catch (error) {
		logTestResult({ test: 'css media', passed: false })
		captureError(error)
		throw error
	} finally {
		probe?.remove()
	}
}
