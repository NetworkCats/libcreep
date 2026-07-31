import { captureError } from '../errors'
import { lieProps, PHANTOM_DARKNESS, documentLie } from '../lies'
import { instanceId, hashMini } from '../utils/crypto'
import { createTimer, queueEvent, EMOJIS, CSS_FONT_FAMILY, IS_BLINK, IS_GECKO, logTestResult } from '../utils/helpers'
import { createMeasurementFragment, replaceElement } from '../utils/measurement'
let probeSequence = 0

// inspired by
// https://privacycheck.sec.lrz.de/active/fp_gcr/fp_getclientrects.html
// https://privacycheck.sec.lrz.de/active/fp_e/fp_emoji.html
export default async function getClientRects() {
	let container: HTMLElement | null = null
	let placeholder: HTMLElement | null = null
	try {
		const timer = createTimer()
		await queueEvent(timer)
		type RectValues = Pick<DOMRectReadOnly, 'bottom' | 'height' | 'left' | 'right' | 'width' | 'top' | 'x' | 'y'>
		const requireRect = (domRect: DOMRect | undefined, label: string): DOMRect => {
			if (!domRect) throw new Error(`${label} returned no rectangle`)
			return domRect
		}
		const toNativeObject = (domRect: DOMRectReadOnly): RectValues => {
			return {
				bottom: domRect.bottom,
				height: domRect.height,
				left: domRect.left,
				right: domRect.right,
				width: domRect.width,
				top: domRect.top,
				x: domRect.x,
				y: domRect.y,
			}
		}
		let lied = (
			lieProps['Element.getClientRects'] ||
			lieProps['Element.getBoundingClientRect'] ||
			lieProps['Range.getClientRects'] ||
			lieProps['Range.getBoundingClientRect'] ||
			lieProps['String.fromCodePoint']
		) || false

		const DOC = (
			PHANTOM_DARKNESS &&
			PHANTOM_DARKNESS.document &&
			PHANTOM_DARKNESS.document.body ? PHANTOM_DARKNESS.document :
				document
		)

		const getBestRect = (el: Element) => {
			let range
			if (!lieProps['Element.getClientRects']) {
				return el.getClientRects()[0]
			} else if (!lieProps['Element.getBoundingClientRect']) {
				return el.getBoundingClientRect()
			} else if (!lieProps['Range.getClientRects']) {
				range = DOC.createRange()
				range.selectNode(el)
				return range.getClientRects()[0]
			}
			range = DOC.createRange()
			range.selectNode(el)
			return range.getBoundingClientRect()
		}

		const rectsId = `${instanceId}-client-rects-${++probeSequence}`
		placeholder = DOC.createElement('div')
		placeholder.setAttribute('id', rectsId)
		DOC.body.appendChild(placeholder)

		const fragment = createMeasurementFragment`
		<div id="${rectsId}">
			<style>
				#${rectsId} .rect-ghost,
				#${rectsId} .rect-known {
				top: 0;
				left: 0;
				position: absolute;
				visibility: hidden;
			}
				#${rectsId} .rect-known {
				width: 100px;
				height: 100px;
				transform: rotate(45deg);
			}
				#${rectsId} .rect-ghost {
				width: 0;
				height: 0;
			}
			</style>
			<div class="rect-known"></div>
			<div class="rect-ghost"></div>
			<div style="perspective:100px;width:1000.099%;" id="${rectsId}-rect-container">
				<style>
				#${rectsId} .rects {
					width: 1000%;
					height: 1000%;
					max-width: 1000%;
				}
				#${rectsId} .absolute {
					position: absolute;
				}
				#${rectsId}-cRect1 {
					border: solid 2.715px;
					border-color: #F72585;
					padding: 3.98px;
					margin-left: 12.12px;
				}
				#${rectsId}-cRect2 {
					border: solid 2px;
					border-color: #7209B7;
					font-size: 30px;
					margin-top: 20px;
					padding: 3.98px;
					transform: skewY(23.1753218deg) rotate3d(10.00099, 90, 0.100000000000009, 60000000000008.00000009deg);
				}
				#${rectsId}-cRect3 {
					border: solid 2.89px;
					border-color: #3A0CA3;
					font-size: 45px;
					transform: skewY(-23.1753218deg) scale(1099.0000000099, 1.89) matrix(1.11, 2.0001, -1.0001, 1.009, 150, 94.4);
					margin-top: 50px;
				}
				#${rectsId}-cRect4 {
					border: solid 2px;
					border-color: #4361EE;
					transform: matrix(1.11, 2.0001, -1.0001, 1.009, 150, 94.4);
					margin-top: 11.1331px;
					margin-left: 12.1212px;
					padding: 4.4545px;
					left: 239.4141px;
					top: 8.5050px;
				}
				#${rectsId}-cRect5 {
					border: solid 2px;
					border-color: #4CC9F0;
					margin-left: 42.395pt;
				}
				#${rectsId}-cRect6 {
					border: solid 2px;
					border-color: #F72585;
					transform: perspective(12890px) translateZ(101.5px);
					padding: 12px;
				}
				#${rectsId}-cRect7 {
					margin-top: -350.552px;
					margin-left: 0.9099rem;
					border: solid 2px;
					border-color: #4361EE;
				}
				#${rectsId}-cRect8 {
					margin-top: -150.552px;
					margin-left: 15.9099rem;
					border: solid 2px;
					border-color: #3A0CA3;
				}
				#${rectsId}-cRect9 {
					margin-top: -110.552px;
					margin-left: 15.9099rem;
					border: solid 2px;
					border-color: #7209B7;
				}
				#${rectsId}-cRect10 {
					margin-top: -315.552px;
					margin-left: 15.9099rem;
					border: solid 2px;
					border-color: #F72585;
				}
				#${rectsId}-cRect11 {
					width: 10px;
					height: 10px;
					margin-left: 15.0000009099rem;
					border: solid 2px;
					border-color: #F72585;
				}
				#${rectsId}-cRect12 {
					width: 10px;
					height: 10px;
					margin-left: 15.0000009099rem;
					border: solid 2px;
					border-color: #F72585;
				}
				#${rectsId}-rect-container .shift-dom-rect {
					top: 1px !important;
					left: 1px !important;
				}
				</style>
				<div id="${rectsId}-cRect1" class="rects"></div>
				<div id="${rectsId}-cRect2" class="rects"></div>
				<div id="${rectsId}-cRect3" class="rects"></div>
				<div id="${rectsId}-cRect4" class="rects absolute"></div>
				<div id="${rectsId}-cRect5" class="rects"></div>
				<div id="${rectsId}-cRect6" class="rects"></div>
				<div id="${rectsId}-cRect7" class="rects absolute"></div>
				<div id="${rectsId}-cRect8" class="rects absolute"></div>
				<div id="${rectsId}-cRect9" class="rects absolute"></div>
				<div id="${rectsId}-cRect10" class="rects absolute"></div>
				<div id="${rectsId}-cRect11" class="rects"></div>
				<div id="${rectsId}-cRect12" class="rects"></div>
				<div id="emoji" class="emojis"></div>
			</div>
			<div id="emoji-container">
				<style>
				#${rectsId} .domrect-emoji {
					font-family: ${CSS_FONT_FAMILY};
					font-size: 200px !important;
					height: auto;
					position: absolute !important;
					transform: scale(1.000999);
				}
				</style>
				${
					EMOJIS.map((emoji) => {
						return `<div class="domrect-emoji">${emoji}</div>`
					}).join('')
				}
			</div>
		</div>
		`
		container = fragment.firstElementChild as HTMLElement | null
		if (!replaceElement(placeholder, fragment)) {
			throw new Error('DOMRect measurement placeholder is detached')
		}
		if (!container) throw new Error('DOMRect measurement container blocked')

		// get emoji set and system
		const pattern: Set<string> = new Set()
		await queueEvent(timer)

		const emojiElems = [...container.getElementsByClassName('domrect-emoji')]
		const emojiSet = emojiElems.reduce((emojiSet, el, i) => {
			const emoji = EMOJIS[i]
			const { height, width } = requireRect(getBestRect(el), 'Emoji measurement')
			const dimensions = `${width},${height}`
			if (emoji && !pattern.has(dimensions)) {
				pattern.add(dimensions)
				emojiSet.add(emoji)
			}
			return emojiSet
		}, new Set() as Set<string>)

		const domrectSystemSum = 0.00001 * [...pattern].map((x) => {
			return x.split(',').reduce((acc, x) => acc += (+x||0), 0)
		}).reduce((acc, x) => acc += x, 0)

		// get clientRects
		const range = DOC.createRange()
		const rectElems = container.getElementsByClassName('rects')

		const elementClientRects = [...rectElems].map((el) => {
			return toNativeObject(requireRect(el.getClientRects()[0], 'Element.getClientRects'))
		})

		const elementBoundingClientRect = [...rectElems].map((el) => {
			return toNativeObject(el.getBoundingClientRect())
		})

		const rangeClientRects = [...rectElems].map((el) => {
			range.selectNode(el)
			return toNativeObject(requireRect(range.getClientRects()[0], 'Range.getClientRects'))
		})

		const rangeBoundingClientRect = [...rectElems].map((el) => {
			range.selectNode(el)
			return toNativeObject(range.getBoundingClientRect())
		})

		// detect failed shift calculation
		// inspired by https://arkenfox.github.io/TZP
		const rect4 = [...rectElems][3]
		const initialRect4 = elementClientRects[3]
		if (!rect4 || !initialRect4) throw new Error('DOMRect shift measurement element blocked')
		const { top: initialTop } = initialRect4
		rect4.classList.add('shift-dom-rect')
		const { top: shiftedTop } = toNativeObject(requireRect(rect4.getClientRects()[0], 'Shifted Element.getClientRects'))
		rect4.classList.remove('shift-dom-rect')
		const { top: unshiftedTop } = toNativeObject(requireRect(rect4.getClientRects()[0], 'Unshifted Element.getClientRects'))
		const diff = initialTop - shiftedTop
		const unshiftLie = diff != (unshiftedTop - shiftedTop)
		if (unshiftLie) {
			lied = true
			documentLie('Element.getClientRects', 'failed unshift calculation')
		}

		// detect failed math calculation lie
		let mathLie = false
		elementClientRects.forEach((rect) => {
			const { right, left, width, bottom, top, height, x, y } = rect
			if (
				right - left != width ||
				bottom - top != height ||
				right - x != width ||
				bottom - y != height
			) {
				lied = true
				mathLie = true
			}
			return
		})
		if (mathLie) {
			documentLie('Element.getClientRects', 'failed math calculation')
		}

		// detect equal elements mismatch lie
		const equalRect1 = elementClientRects[10]
		const equalRect2 = elementClientRects[11]
		if (!equalRect1 || !equalRect2) throw new Error('DOMRect equality measurement elements blocked')
		const { right: right1, left: left1 } = equalRect1
		const { right: right2, left: left2 } = equalRect2
		if (right1 != right2 || left1 != left2) {
			documentLie('Element.getClientRects', 'equal elements mismatch')
			lied = true
		}

		// detect unknown rotate dimensions
		const knownEl = [...container.getElementsByClassName('rect-known')][0]
		if (!knownEl) throw new Error('DOMRect known measurement element blocked')
		const knownDimensions = toNativeObject(requireRect(knownEl.getClientRects()[0], 'Known Element.getClientRects'))
		const knownHash = hashMini(knownDimensions)

		if (IS_BLINK) {
			if (devicePixelRatio === 1 && knownHash !== '9d9215cc') {
				documentLie('Element.getClientRects', 'unknown rotate dimensions')
				lied = true
			}
		} else if (IS_GECKO) {
			const Rotate: Record<string, boolean> = {
				'e38453f0': true, // 100, etc
			}
			if (!Rotate[knownHash]) {
				documentLie('Element.getClientRects', 'unknown rotate dimensions')
				lied = true
			}
		}

		// detect ghost dimensions
		const ghostEl = [...container.getElementsByClassName('rect-ghost')][0]
		if (!ghostEl) throw new Error('DOMRect ghost measurement element blocked')
		const ghostDimensions = toNativeObject(requireRect(ghostEl.getClientRects()[0], 'Ghost Element.getClientRects'))
		const hasGhostDimensions = (Object.keys(ghostDimensions) as (keyof RectValues)[])
			.some((key) => ghostDimensions[key] !== 0)

		if (hasGhostDimensions) {
			documentLie('Element.getClientRects', 'unknown ghost dimensions')
			lied = true
		}

		logTestResult({ time: timer.stop(), test: 'rects', passed: true })
		return {
			elementClientRects,
			elementBoundingClientRect,
			rangeClientRects,
			rangeBoundingClientRect,
			emojiSet: [...emojiSet],
			domrectSystemSum,
			lied,
		}
	} catch (error) {
		logTestResult({ test: 'rects', passed: false })
		captureError(error)
		throw error
	} finally {
		container?.remove()
		placeholder?.remove()
	}
}
