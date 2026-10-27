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
	const fragment = document.importNode(template.content, true)
	// Callers remove only their container, so drop the template's surrounding
	// whitespace text nodes instead of leaving them in the host document.
	for (const node of Array.from(fragment.childNodes)) {
		if (node.nodeType === Node.TEXT_NODE && !node.textContent?.trim()) node.remove()
	}
	return fragment
}

export { createMeasurementFragment, replaceElement }
