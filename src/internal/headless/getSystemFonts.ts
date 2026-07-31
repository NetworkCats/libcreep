import { Platform, SYSTEM_FONTS } from './constants'

const GeckoFonts: Record<string, string> = {
	'-apple-system': Platform.MAC,
	'Segoe UI': Platform.WINDOWS,
	Tahoma: Platform.WINDOWS,
	'Yu Gothic UI': Platform.WINDOWS,
	'Microsoft JhengHei UI': Platform.WINDOWS,
	'Microsoft YaHei UI': Platform.WINDOWS,
	'Meiryo UI': Platform.WINDOWS,
	Cantarell: Platform.LINUX,
	Ubuntu: Platform.LINUX,
	Sans: Platform.LINUX,
	'sans-serif': Platform.LINUX,
	'Fira Sans': Platform.LINUX,
	Roboto: Platform.ANDROID,
}

export function getSystemFonts(): string {
	const { body, defaultView } = document
	if (!body || !defaultView) return ''
	const el = document.createElement('div')
	body.appendChild(el)
	try {
		const systemFonts = String([
			...SYSTEM_FONTS.reduce((acc, font) => {
				el.setAttribute('style', `font: ${font} !important`)
				return acc.add(defaultView.getComputedStyle(el).fontFamily)
			}, new Set<string>()),
		])
		const geckoPlatform = GeckoFonts[systemFonts]
		return geckoPlatform ? `${systemFonts}:${geckoPlatform}` : systemFonts
	} catch {
		return ''
	} finally {
		el.remove()
	}
}
