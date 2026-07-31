import { captureError } from '../errors'
import { documentLie, lieProps, PHANTOM_DARKNESS } from '../lies'
import { instanceId } from '../utils/crypto'

import { createTimer, queueEvent, CSS_FONT_FAMILY, EMOJIS, logTestResult } from '../utils/helpers'
import { createMeasurementFragment, replaceElement } from '../utils/measurement'
let probeSequence = 0

export default async function getSVG() {
	let container: HTMLElement | null = null
	let placeholder: HTMLElement | null = null
	try {
		const timer = createTimer()
		await queueEvent(timer)
		let lied = (
			lieProps['SVGRect.height'] ||
			lieProps['SVGRect.width'] ||
			lieProps['SVGRect.x'] ||
			lieProps['SVGRect.y'] ||
			lieProps['String.fromCodePoint'] ||
			lieProps['SVGRectElement.getBBox'] ||
			lieProps['SVGTextContentElement.getExtentOfChar'] ||
			lieProps['SVGTextContentElement.getSubStringLength'] ||
			lieProps['SVGTextContentElement.getComputedTextLength']
		) || false

		const doc = (
			PHANTOM_DARKNESS &&
			PHANTOM_DARKNESS.document &&
			PHANTOM_DARKNESS.document.body ? PHANTOM_DARKNESS.document :
				document
		)

		const containerId = `${instanceId}-svg-container-${++probeSequence}`
		const svgBoxId = `${containerId}-box`
		placeholder = doc.createElement('div')
		doc.body.appendChild(placeholder)

		// patch div
		const fragment = createMeasurementFragment`
			<div id="${containerId}">
				<style>
				#${containerId} {
					position: absolute;
					left: -9999px;
					height: auto;
				}
				#${containerId} .shift-svg {
					transform: scale(1.000999) !important;
				}
				#${containerId} .svgrect-emoji {
					font-family: ${CSS_FONT_FAMILY};
					font-size: 200px !important;
					height: auto;
					position: absolute !important;
					transform: scale(1.000999);
				}
				</style>
				<svg>
					<g id="${svgBoxId}">
						${
							EMOJIS.map((emoji) => {
								return `<text x="32" y="32" class="svgrect-emoji">${emoji}</text>`
							}).join('')
						}
					</g>
				</svg>
			</div>
		`
		container = fragment.firstElementChild as HTMLElement | null
		if (!replaceElement(placeholder, fragment)) {
			throw new Error('SVG measurement placeholder is detached')
		}
		if (!container) throw new Error('SVG measurement container blocked')

		// SVG
		type RectValues = Pick<DOMRectReadOnly, 'height' | 'width' | 'x' | 'y'>
		const reduceToObject = (nativeObj: DOMRectReadOnly): RectValues => {
			return {
				height: nativeObj.height,
				width: nativeObj.width,
				x: nativeObj.x,
				y: nativeObj.y,
			}
		}
		const reduceToSum = (nativeObj: DOMRectReadOnly): number => {
			return (['height', 'width', 'x', 'y'] as const).reduce((acc, key) => {
				const val = Number(nativeObj[key])
				return Number.isNaN(val) ? acc : (acc += val)
			}, 0)
		}

		const getObjectSum = (obj?: RectValues): number => !obj ? 0 :
			(Object.keys(obj) as (keyof RectValues)[])
				.reduce((acc, key) => acc + Math.abs(obj[key]), 0)

		// SVGRect
		const svgBox = container.querySelector(`#${svgBoxId}`) as SVGGElement
		if (!svgBox) throw new Error('SVG measurement element blocked')
		const bBox = reduceToObject(svgBox.getBBox())

		// compute SVGRect emojis
		const pattern = new Set<string>()
		const svgElems = [...svgBox.querySelectorAll<SVGTextContentElement>('.svgrect-emoji')]

		await queueEvent(timer)
		const emojiSet = svgElems.reduce((emojiSet, el, i) => {
			const emoji = EMOJIS[i]
			const dimensions = ''+el.getComputedTextLength()
			if (emoji && !pattern.has(dimensions)) {
				pattern.add(dimensions)
				emojiSet.add(emoji)
			}
			return emojiSet
		}, new Set<string>())

		// svgRect System Sum
		const svgrectSystemSum = 0.00001 * [...pattern].map((x) => {
			return x.split(',').reduce((acc, x) => acc += (+x||0), 0)
		}).reduce((acc, x) => acc += x, 0)

		// detect failed shift calculation
		const svgEmojiEl = svgElems[0]
		if (!svgEmojiEl) throw new Error('SVG emoji measurement element blocked')
		const initial = svgEmojiEl.getComputedTextLength()
		svgEmojiEl.classList.add('shift-svg')
		const shifted = svgEmojiEl.getComputedTextLength()
		svgEmojiEl.classList.remove('shift-svg')
		const unshifted = svgEmojiEl.getComputedTextLength()
		if ((initial - shifted) != (unshifted - shifted)) {
			lied = true
			documentLie('SVGTextContentElement.getComputedTextLength', 'failed unshift calculation')
		}

		const data = {
			bBox: getObjectSum(bBox),
			extentOfChar: reduceToSum(svgEmojiEl.getExtentOfChar(0)),
			subStringLength: svgEmojiEl.getSubStringLength(0, 10),
			computedTextLength: svgEmojiEl.getComputedTextLength(),
			emojiSet: [...emojiSet],
			svgrectSystemSum,
			lied,
		}

		logTestResult({ time: timer.stop(), test: 'svg', passed: true })
		return data
	} catch (error) {
		logTestResult({ test: 'svg', passed: false })
		captureError(error)
		throw error
	} finally {
		container?.remove()
		placeholder?.remove()
	}
}
