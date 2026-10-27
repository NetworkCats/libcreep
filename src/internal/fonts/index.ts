import { captureError } from '../errors'
import { PHANTOM_DARKNESS, lieProps, getRandomValues } from '../lies'
import { sendToTrash } from '../trash'

import { isFontOSBad } from '../utils/fonts'
import {
	CSS_FONT_FAMILY,
	createTimer,
	queueEvent,
	EMOJIS,
	logTestResult,
	USER_AGENT_OS,
	LowerEntropy,
	Analysis,
} from '../utils/helpers'
import { createMeasurementFragment, replaceElement } from '../utils/measurement'

// inspired by Lalit Patel's fontdetect.js
// https://www.lalit.org/wordpress/wp-content/uploads/2008/05/fontdetect.js?ver=0.3
const WindowsFonts: Record<string, readonly string[]> = {
	// https://docs.microsoft.com/en-us/typography/fonts/windows_11_font_list
	'7': ['Cambria Math', 'Lucida Console'],
	'8': ['Aldhabi', 'Gadugi', 'Myanmar Text', 'Nirmala UI'],
	'8.1': ['Leelawadee UI', 'Javanese Text', 'Segoe UI Emoji'],
	'10': [
		'HoloLens MDL2 Assets', // 10 (v1507) +
		'Segoe MDL2 Assets', // 10 (v1507) +
		'Bahnschrift', // 10 (v1709) +-
		'Ink Free', // 10 (v1803) +-
	],
	'11': ['Segoe Fluent Icons'],
}

const MacOSFonts: Record<string, readonly string[]> = {
	// Mavericks and below
	'10.9': [
		'Helvetica Neue',
		'Geneva', // mac (not iOS)
	],
	// Yosemite
	'10.10': ['Kohinoor Devanagari Medium', 'Luminari'],
	// El Capitan
	'10.11': ['PingFang HK Light'],
	// Sierra: https://support.apple.com/en-ie/HT206872
	'10.12': ['American Typewriter Semibold', 'Futura Bold', 'SignPainter-HouseScript Semibold'],
	// High Sierra: https://support.apple.com/en-me/HT207962
	// Mojave: https://support.apple.com/en-us/HT208968
	'10.13-10.14': ['InaiMathi Bold'],
	// Catalina: https://support.apple.com/en-us/HT210192
	// Big Sur: https://support.apple.com/en-sg/HT211240
	'10.15-11': ['Galvji', 'MuktaMahee Regular'],
	// Monterey: https://support.apple.com/en-us/HT212587
	'12': ['Noto Sans Gunjala Gondi Regular', 'Noto Sans Masaram Gondi Regular', 'Noto Serif Yezidi Regular'],
	// Ventura: https://support.apple.com/en-us/HT213266
	'13': [
		'Apple SD Gothic Neo ExtraBold',
		'STIX Two Math Regular',
		'STIX Two Text Regular',
		'Noto Sans Canadian Aboriginal Regular',
	],
}

const DesktopAppFonts: Record<string, readonly string[]> = {
	// docs.microsoft.com/en-us/typography/font-list/ms-outlook
	'Microsoft Outlook': ['MS Outlook'],
	// https://community.adobe.com/t5/postscript-discussions/zwadobef-font/m-p/3730427#M785
	'Adobe Acrobat': ['ZWAdobeF'],
	// https://wiki.documentfoundation.org/Fonts
	LibreOffice: ['Amiri', 'KACSTOffice', 'Liberation Mono', 'Source Code Pro'],
	// https://superuser.com/a/611804
	OpenOffice: ['DejaVu Sans', 'Gentium Book Basic', 'OpenSymbol'],
}

const APPLE_FONTS = Object.values(MacOSFonts).flat()
const WINDOWS_FONTS = Object.values(WindowsFonts).flat()
const DESKTOP_APP_FONTS = Object.values(DesktopAppFonts).flat()
const LINUX_FONTS = [
	'Arimo', // ubuntu, chrome os
	'Chilanka', // ubuntu (not TB)
	'Cousine', // ubuntu, chrome os
	'Jomolhari', // chrome os
	'MONO', // ubuntu, chrome os (not TB)
	'Noto Color Emoji', // Linux
	'Ubuntu', // ubuntu (not TB)
]
const ANDROID_FONTS = [
	'Dancing Script', // android
	'Droid Sans Mono', // Android
	'Roboto', // Android, Chrome OS
]

const FONT_LIST = [...APPLE_FONTS, ...WINDOWS_FONTS, ...LINUX_FONTS, ...ANDROID_FONTS, ...DESKTOP_APP_FONTS].sort()

export default async function getFonts() {
	const getPixelEmojis = ({ mount, emojis }: { mount: HTMLElement; emojis: readonly string[] }) => {
		let container: Element | null = null
		try {
			const view = mount.ownerDocument.defaultView
			if (!view) throw new Error('Font emoji measurement realm is unavailable')
			const className = `libcreep-pixel-emoji-${getRandomValues()}`
			const fragment = createMeasurementFragment`
				<div>
					<style>
					.${className} {
						font-family: ${CSS_FONT_FAMILY};
						font-size: 200px !important;
						height: auto;
						position: absolute !important;
						transform: scale(1.000999);
					}
					</style>
					${emojis
						.map((emoji: string) => {
							return `<div class="${className}">${emoji}</div>`
						})
						.join('')}
				</div>
			`
			container = fragment.firstElementChild
			if (!container || !replaceElement(mount, fragment)) {
				throw new Error('Font emoji measurement fixture failed')
			}

			// get emoji set and system
			const getEmojiDimensions = (style: CSSStyleDeclaration) => {
				return {
					width: style.inlineSize,
					height: style.blockSize,
				}
			}

			const pattern = new Set<string>()
			const emojiElems = [...container.getElementsByClassName(className)]
			const emojiSet = emojiElems.reduce((emojiSet, el, i) => {
				const style = view.getComputedStyle(el)
				const emoji = emojis[i]
				const { height, width } = getEmojiDimensions(style)
				const dimensions = `${width},${height}`
				if (emoji !== undefined && !pattern.has(dimensions)) {
					pattern.add(dimensions)
					emojiSet.add(emoji)
				}
				return emojiSet
			}, new Set<string>())

			const pixelToNumber = (pixels: string) => +pixels.replace('px', '')
			const pixelSizeSystemSum =
				0.00001 *
				[...pattern]
					.map((x) => {
						return x
							.split(',')
							.map((value) => pixelToNumber(value))
							.reduce((acc, value) => acc + (value || 0), 0)
					})
					.reduce((acc, x) => (acc += x), 0)

			container.remove()

			return {
				emojiSet: [...emojiSet],
				pixelSizeSystemSum,
			}
		} catch (error) {
			container?.remove()
			mount.remove()
			captureError(error, 'font emoji measurement failed')
			return {
				emojiSet: [],
				pixelSizeSystemSum: 0,
			}
		}
	}

	const getFontFaceLoadFonts = async (fontList: readonly string[], doc: Document) => {
		try {
			let fontsChecked: string[] = []
			if (!doc.fonts.check(`0px "${getRandomValues()}"`)) {
				fontsChecked = fontList.reduce((acc, font) => {
					const found = doc.fonts.check(`0px "${font}"`)
					if (found) acc.push(font)
					return acc
				}, [] as string[])
			}
			const FontFaceConstructor = doc.defaultView && Reflect.get(doc.defaultView, 'FontFace')
			if (typeof FontFaceConstructor != 'function') return fontsChecked.sort()
			const fontFaceList = fontList.reduce<FontFace[]>((faces, font) => {
				try {
					faces.push(Reflect.construct(FontFaceConstructor, [font, `local("${font}")`]) as FontFace)
				} catch {}
				return faces
			}, [])
			const responseCollection = await new Promise<PromiseSettledResult<FontFace>[]>((resolve) => {
				let settled = false
				const finish = (results: PromiseSettledResult<FontFace>[]) => {
					if (settled) return
					settled = true
					clearTimeout(timeout)
					resolve(results)
				}
				// On a slow load, keep the faces that already finished instead of
				// discarding every FontFace result.
				const timeout = setTimeout(() => finish(fontFaceList
					.filter((font) => font.status == 'loaded')
					.map((value) => ({ status: 'fulfilled', value }))), 1000)
				void Promise.allSettled(fontFaceList.map((font) => Promise.resolve().then(() => font.load()))).then(
					finish,
				)
			})
			const fontsLoaded = responseCollection.reduce((acc, font) => {
				if (font.status == 'fulfilled') {
					acc.push(font.value.family)
				}
				return acc
			}, [] as string[])
			return [...new Set([...fontsChecked, ...fontsLoaded])].sort()
		} catch (error) {
			captureError(error, 'FontFace loading failed')
			return []
		}
	}

	const getPlatformVersion = (fonts: readonly string[]) => {
		const getWindows = ({
			fonts,
			fontMap,
		}: {
			fonts: readonly string[]
			fontMap: Record<string, readonly string[]>
		}) => {
			const fontVersion: Record<string, string | boolean | undefined> = {
				['11']: fontMap['11']?.find((x) => fonts.includes(x)),
				['10']: fontMap['10']?.find((x) => fonts.includes(x)),
				['8.1']: fontMap['8.1']?.find((x) => fonts.includes(x)),
				['8']: fontMap['8']?.find((x) => fonts.includes(x)),
				// require complete set of Windows 7 fonts
				['7']: fontMap['7']?.every((x) => fonts.includes(x)) ?? false,
			}
			const hash =
				'' +
				Object.keys(fontVersion)
					.sort()
					.filter((key) => !!fontVersion[key])
			const hashMap: Record<string, string> = {
				'10,11,7,8,8.1': '11',
				'10,7,8,8.1': '10',
				'7,8,8.1': '8.1',
				'11,7,8,8.1': '8.1', // missing 10
				'7,8': '8',
				'10,7,8': '8', // missing 8.1
				'10,11,7,8': '8', // missing 8.1
				'7': '7',
				'7,8.1': '7',
				'10,7,8.1': '7', // missing 8
				'10,11,7,8.1': '7', // missing 8
			}
			const version = hashMap[hash]
			return version ? `Windows ${version}` : undefined
		}

		const getMacOS = ({
			fonts,
			fontMap,
		}: {
			fonts: readonly string[]
			fontMap: Record<string, readonly string[]>
		}) => {
			const fontVersion: Record<string, string | boolean | undefined> = {
				['13']: fontMap['13']?.find((x) => fonts.includes(x)),
				['12']: fontMap['12']?.find((x) => fonts.includes(x)),
				['10.15-11']: fontMap['10.15-11']?.find((x) => fonts.includes(x)),
				['10.13-10.14']: fontMap['10.13-10.14']?.find((x) => fonts.includes(x)),
				['10.12']: fontMap['10.12']?.find((x) => fonts.includes(x)),
				['10.11']: fontMap['10.11']?.find((x) => fonts.includes(x)),
				['10.10']: fontMap['10.10']?.find((x) => fonts.includes(x)),
				// require complete set of 10.9 fonts
				['10.9']: fontMap['10.9']?.every((x) => fonts.includes(x)) ?? false,
			}
			const hash =
				'' +
				Object.keys(fontVersion)
					.sort()
					.filter((key) => !!fontVersion[key])
			const hashMap: Record<string, string> = {
				'10.10,10.11,10.12,10.13-10.14,10.15-11,10.9,12,13': 'Ventura or newer',
				'10.10,10.11,10.12,10.13-10.14,10.15-11,10.9,12': 'Monterey',
				'10.10,10.11,10.12,10.13-10.14,10.15-11,10.9': '10.15-11',
				'10.10,10.11,10.12,10.13-10.14,10.9': '10.13-10.14',
				'10.10,10.11,10.12,10.9': 'Sierra', // 10.12
				'10.10,10.11,10.9': 'El Capitan', // 10.11
				'10.10,10.9': 'Yosemite', // 10.10
				'10.9': 'Mavericks', // 10.9
			}
			const version = hashMap[hash]
			return version ? `macOS ${version}` : undefined
		}

		return getWindows({ fonts, fontMap: WindowsFonts }) || getMacOS({ fonts, fontMap: MacOSFonts })
	}

	const getDesktopApps = (fonts: readonly string[]): string[] =>
		Object.entries(DesktopAppFonts)
			.filter(([, appFontSet]) => appFontSet.every((font) => fonts.includes(font)))
			.map(([app]) => app)

	try {
		const timer = createTimer()
		await queueEvent(timer)
		const doc =
			PHANTOM_DARKNESS && PHANTOM_DARKNESS.document && PHANTOM_DARKNESS.document.body
				? PHANTOM_DARKNESS.document
				: document
		const div = doc.createElement('div')
		doc.body.appendChild(div)

		const { emojiSet, pixelSizeSystemSum } =
			getPixelEmojis({
				mount: div,
				emojis: EMOJIS,
			}) || {}

		const fontList = FONT_LIST
		const fontFaceLoadFonts = await getFontFaceLoadFonts(fontList, doc)
		const platformVersion = getPlatformVersion(fontFaceLoadFonts)
		const apps = getDesktopApps(fontFaceLoadFonts)

		// detect lies
		const lied =
			lieProps['FontFace.load'] ||
			lieProps['FontFace.family'] ||
			lieProps['FontFace.status'] ||
			lieProps['String.fromCodePoint'] ||
			lieProps['CSSStyleDeclaration.setProperty'] ||
			lieProps['CSS2Properties.setProperty'] ||
			false

		if (USER_AGENT_OS !== undefined && isFontOSBad(USER_AGENT_OS, fontFaceLoadFonts)) {
			LowerEntropy.FONTS = true
			Analysis.FontOsIsBad = true
			sendToTrash('platform', `${USER_AGENT_OS} system and fonts are uncommon`)
		}

		logTestResult({ time: timer.stop(), test: 'fonts', passed: true })
		return {
			fontFaceLoadFonts,
			platformVersion,
			apps,
			emojiSet,
			pixelSizeSystemSum,
			lied,
		}
	} catch (error) {
		logTestResult({ test: 'fonts', passed: false })
		captureError(error)
		throw error
	}
}
