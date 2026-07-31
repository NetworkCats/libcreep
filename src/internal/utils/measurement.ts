// Hidden measurement-fixture helpers used by DOMRect, font, and SVG probes.
function replaceElement(
	oldElement: HTMLElement | null,
	newElement: DocumentFragment,
): true | null
function replaceElement<T>(
	oldElement: HTMLElement | null,
	newElement: DocumentFragment,
	callback: () => T,
): T | null
function replaceElement(
	oldElement: HTMLElement | null,
	newElement: DocumentFragment,
	callback?: () => unknown,
): unknown {
	if (!oldElement?.parentNode) return null
	oldElement.parentNode.replaceChild(newElement, oldElement)
	return typeof callback === 'function' ? callback() : true
}

function createMeasurementFragment(
	templateStrings: TemplateStringsArray,
	...expressions: unknown[]
) {
	const template = document.createElement('template')
	template.innerHTML = templateStrings
		.map((value, index) => `${value}${expressions[index] ?? ''}`)
		.join('')
	return document.importNode(template.content, true)
}

export { createMeasurementFragment, replaceElement }
