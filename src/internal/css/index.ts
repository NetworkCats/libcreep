import { captureError } from '../errors'

import { createTimer, logTestResult } from '../utils/helpers'
export default function getCSS() {
	type StyleSource = 'getComputedStyle' | 'HTMLElement.style' | 'CSSRuleList.style'
	const computeStyle = (
		type: StyleSource,
		{ require: [reportError] }: { require: [typeof captureError] },
	) => {
		try {
			// get CSSStyleDeclaration
			// Read stylesheet rules only when requested: a cross-origin first
			// stylesheet throws on cssRules access and would discard the result.
			const getRuleStyle = (): CSSStyleDeclaration | undefined => {
				const firstRule = document.styleSheets[0]?.cssRules[0]
				const ruleStyle: unknown = firstRule && Reflect.get(firstRule, 'style')
				return ruleStyle instanceof CSSStyleDeclaration ? ruleStyle : undefined
			}
			const cssStyleDeclaration: CSSStyleDeclaration | undefined = (
				type == 'getComputedStyle' ? getComputedStyle(document.body) :
					type == 'HTMLElement.style' ? document.body.style :
						getRuleStyle()
			)
			if (!cssStyleDeclaration) {
				throw new TypeError('invalid argument string')
			}
			// get properties
			const proto = Object.getPrototypeOf(cssStyleDeclaration)
			const prototypeProperties = Object.getOwnPropertyNames(proto)
			const ownEnumerablePropertyNames: string[] = []
			const cssVar = /^--.*$/
			Object.keys(cssStyleDeclaration).forEach((key) => {
				const numericKey = !isNaN(+key)
				const rawValue: unknown = Reflect.get(cssStyleDeclaration, key)
				const value = typeof rawValue == 'string' ? rawValue : String(rawValue ?? '')
				const customPropKey = cssVar.test(key)
				const customPropValue = cssVar.test(value)
				if (numericKey && !customPropValue) {
					return ownEnumerablePropertyNames.push(value)
				} else if (!numericKey && !customPropKey) {
					return ownEnumerablePropertyNames.push(key)
				}
				return
			})
			// get properties in prototype chain (required only in chrome)
			const propertiesInPrototypeChain: Record<string, true> = {}
			const capitalize = (str: string) => str.charAt(0).toUpperCase() + str.slice(1)
			const uncapitalize = (str: string) => str.charAt(0).toLowerCase() + str.slice(1)
			const removeFirstChar = (str: string) => str.slice(1)
			const caps = /[A-Z]/
			ownEnumerablePropertyNames.forEach((key) => {
				if (propertiesInPrototypeChain[key]) {
					return
				}
				// determine attribute type
				const isNamedAttribute = key.indexOf('-') > -1
				const isAliasAttribute = caps.test(key)
				// reduce key for computation
				const firstChar = key.charAt(0)
				const isPrefixedName = isNamedAttribute && firstChar == '-'
				const isCapitalizedAlias = isAliasAttribute && firstChar == firstChar.toUpperCase()
				key = (
					isPrefixedName ? removeFirstChar(key) :
						isCapitalizedAlias ? uncapitalize(key) :
							key
				)
				// find counterpart in CSSStyleDeclaration object or its prototype chain
				if (isNamedAttribute) {
					const aliasAttribute = key.split('-').map((word, index) => index == 0 ? word : capitalize(word)).join('')
					if (aliasAttribute in cssStyleDeclaration) {
						propertiesInPrototypeChain[aliasAttribute] = true
					} else if (capitalize(aliasAttribute) in cssStyleDeclaration) {
						propertiesInPrototypeChain[capitalize(aliasAttribute)] = true
					}
				} else if (isAliasAttribute) {
					const namedAttribute = key.replace(/[A-Z]/g, (char) => '-' + char.toLowerCase())
					if (namedAttribute in cssStyleDeclaration) {
						propertiesInPrototypeChain[namedAttribute] = true
					} else if (`-${namedAttribute}` in cssStyleDeclaration) {
						propertiesInPrototypeChain[`-${namedAttribute}`] = true
					}
				}
				return
			})
			// compile keys
			const keys = [
				...new Set([
					...prototypeProperties,
					...ownEnumerablePropertyNames,
					...Object.keys(propertiesInPrototypeChain),
				]),
			]
			const interfaceName = String(proto).match(/\[object (.+)\]/)?.[1] ?? 'CSSStyleDeclaration'

			return { keys, interfaceName }
		} catch (error) {
			reportError(error)
			return
		}
	}

	const getSystemStyles = () => {
		let el: HTMLElement | undefined
		try {
			const colors = [
				'ActiveBorder',
				'ActiveCaption',
				'ActiveText',
				'AppWorkspace',
				'Background',
				'ButtonBorder',
				'ButtonFace',
				'ButtonHighlight',
				'ButtonShadow',
				'ButtonText',
				'Canvas',
				'CanvasText',
				'CaptionText',
				'Field',
				'FieldText',
				'GrayText',
				'Highlight',
				'HighlightText',
				'InactiveBorder',
				'InactiveCaption',
				'InactiveCaptionText',
				'InfoBackground',
				'InfoText',
				'LinkText',
				'Mark',
				'MarkText',
				'Menu',
				'MenuText',
				'Scrollbar',
				'ThreeDDarkShadow',
				'ThreeDFace',
				'ThreeDHighlight',
				'ThreeDLightShadow',
				'ThreeDShadow',
				'VisitedText',
				'Window',
				'WindowFrame',
				'WindowText',
			]
			const fonts = [
				'caption',
				'icon',
				'menu',
				'message-box',
				'small-caption',
				'status-bar',
			]

			const getStyles = (el: HTMLElement) => ({
				colors: colors.map((color) => {
					el.setAttribute('style', `background-color: ${color} !important`)
					return {
						[color]: getComputedStyle(el).backgroundColor,
					}
				}),
				fonts: fonts.map((font) => {
					el.setAttribute('style', `font: ${font} !important`)
					const computedStyle = getComputedStyle(el)
					return {
						[font]: `${computedStyle.fontSize} ${computedStyle.fontFamily}`,
					}
				}),
			})

			el = document.createElement('div')
			el.hidden = true
			document.body.append(el)
			return getStyles(el)
		} catch (error) {
			captureError(error)
			return
		} finally {
			el?.remove()
		}
	}

	try {
		const timer = createTimer()
		timer.start()
		const computedStyle = computeStyle('getComputedStyle', { require: [captureError] })
		const system = getSystemStyles()
		if (computedStyle === undefined && system === undefined) {
			logTestResult({ test: 'computed style', passed: false })
			return
		}
		logTestResult({ time: timer.stop(), test: 'computed style', passed: true })
		return {
			computedStyle,
			system,
		}
	} catch (error) {
		logTestResult({ test: 'computed style', passed: false })
		captureError(error)
		throw error
	}
}
