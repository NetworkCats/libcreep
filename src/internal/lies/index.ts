/* eslint-disable new-cap */
/* eslint-disable no-unused-vars */
import { captureError } from '../errors'
import { IS_BLINK, IS_WEBKIT, IS_GECKO, IS_WORKER_SCOPE } from '../utils/helpers'

// Collect lies detected
function createLieRecords() {
	const records: Record<string, string[]> = Object.create(null) as Record<string, string[]>
	return {
		getRecords: () => Object.fromEntries(Object.entries(records).map(([name, lies]) => [name, [...lies]])),
		resetRecords: (baseline: Readonly<Record<string, readonly string[]>> = {}) => {
			Object.keys(records).forEach((name) => delete records[name])
			Object.entries(baseline).forEach(([name, lies]) => {
				records[name] = [...lies]
			})
		},
		documentLie: (name: string, lie: string | readonly string[]): void => {
				const isArray = Array.isArray(lie)
			if (records[name]) {
				if (isArray) {
					records[name] = [...records[name], ...lie]
					return
				}
				records[name].push(lie as string)
				return
			}
			records[name] = isArray ? [...lie] : [lie as string]
		},
	}
}

const lieRecords = createLieRecords()
const { documentLie } = lieRecords

const GHOST = `
	height: 100vh;
	width: 100vw;
	position: absolute;
	left:-10000px;
	visibility: hidden;
`
function getRandomValues() {
	return (
		String.fromCharCode(Math.random() * 26 + 97) +
		Math.random().toString(36).slice(-7)
	)
}

function getBehemothIframe(win: Window): Window | null {
	try {
		if (!IS_BLINK) return win

		const div = win.document.createElement('div')
		div.setAttribute('id', getRandomValues())
		div.setAttribute('style', GHOST)
		div.innerHTML = `<div><iframe></iframe></div>`
		win.document.body.appendChild(div)
		const child = div.firstElementChild
		const iframe = child?.firstElementChild

		if (!iframe || iframe.localName != 'iframe') return null

		const { contentWindow } = iframe as HTMLIFrameElement
		if (!contentWindow) return null

		const div2 = contentWindow.document.createElement('div')
		div2.innerHTML = `<div><iframe></iframe></div>`
		contentWindow.document.body.appendChild(div2)
		const iframe2 = div2.firstElementChild?.firstElementChild
		return iframe2?.localName == 'iframe' ? (iframe2 as HTMLIFrameElement).contentWindow : null
	} catch (error) {
		captureError(error, 'client blocked behemoth iframe')
		return win
	}
}

const RAND = getRandomValues()
const HAS_REFLECT = 'Reflect' in self

function isTypeError(err: unknown): boolean {
	try {
		return err?.constructor?.name == 'TypeError'
	} catch (error) {
		return false
	}
}

interface ErrorTrap {
	spawnErr: () => unknown
	withStack?: (error: unknown) => boolean
	final?: () => unknown
}
function failsTypeError({ spawnErr, withStack, final }: ErrorTrap): boolean {
	let failed = false
	try {
		spawnErr()
		failed = true
	} catch (err: unknown) {
		try {
			failed = !isTypeError(err) || (withStack?.(err) ?? false)
		} catch {
			failed = true
		}
	} finally {
		try {
			final?.()
		} catch {
			failed = true
		}
	}
	return failed
}

function restorePrototype(target: object, prototype: object | null): void {
	let restored = false
	try {
		restored = Reflect.setPrototypeOf(target, prototype)
	} catch {}
	if (!restored) {
		Object.setPrototypeOf(target, prototype)
	}
	if (Object.getPrototypeOf(target) !== prototype) throw new TypeError('prototype restoration failed')
}

function failsWithError(fn: () => unknown): boolean {
	try {
		fn()
		return false
	} catch {
		return true
	}
}

function hasKnownToString(name: string) {
	return {
		[`function ${name}() { [native code] }`]: true,
		[`function get ${name}() { [native code] }`]: true,
		[`function () { [native code] }`]: true,
		[`function ${name}() {${'\n'}    [native code]${'\n'}}`]: true,
		[`function get ${name}() {${'\n'}    [native code]${'\n'}}`]: true,
		[`function () {${'\n'}    [native code]${'\n'}}`]: true,
	}
}

function hasValidStack(err: unknown, reg: RegExp, i: number = 1): boolean {
	const value = readErrorValue(err, i === 0 ? 'message' : 'stack')
	if (i === 0) return reg.test(value)
	return reg.test(value.split('\n')[i] || '')
}

function readErrorValue(error: unknown, property: 'message' | 'stack'): string {
	try {
		if (error == null || (typeof error != 'object' && typeof error != 'function')) return String(error)
		const value = Reflect.get(error, property)
		return typeof value == 'string' ? value : String(value ?? '')
	} catch {
		return ''
	}
}

const AT_FUNCTION = /at Function\.toString /
const AT_OBJECT = /at Object\.toString/
const FUNCTION_INSTANCE = /at (Function\.)?\[Symbol.hasInstance\]/ // useful if < Chrome 102
const PROXY_INSTANCE = /at (Proxy\.)?\[Symbol.hasInstance\]/ // useful if < Chrome 102
const STRICT_MODE = /strict mode/

// API Function Test
type ApiFunction = (...args: never[]) => unknown

interface LiesConfig {
	scope: Window & typeof globalThis,
	apiFunction: ApiFunction
	proto: object
	obj: object | null
	lieProps: Record<string, string[]>
}
interface LieResult {
	lied: number
	lieTypes: string[]
}
function queryLies({
	scope,
	apiFunction,
	proto,
	obj,
	lieProps,
}: LiesConfig): LieResult {
	if (typeof apiFunction != 'function') {
		return {
			lied: 0,
			lieTypes: [],
		}
	}
	const name = apiFunction.name.replace(/get\s/, '')
	const objName = obj == null ? undefined : Reflect.get(obj, 'name')
	const nativeProto = Object.getPrototypeOf(apiFunction)
	const restoreApiFunction = () => restorePrototype(apiFunction, nativeProto)
	const interfaceInstance = typeof objName == 'string' ? Reflect.get(self, objName.toLowerCase()) : undefined
	const hasInterfaceInstance = interfaceInstance != null &&
		(typeof interfaceInstance == 'object' || typeof interfaceInstance == 'function')
	let lies: Record<string, boolean> = {
		// custom lie string names
		['failed illegal error']: !!obj && failsTypeError({
			spawnErr: () => Reflect.get(Reflect.get(obj, 'prototype'), name),
		}),
		['failed undefined properties']: (
			!!obj && typeof objName == 'string' && /^(screen|navigator)$/i.test(objName) && hasInterfaceInstance && !!(
				Object.getOwnPropertyDescriptor(interfaceInstance, name) || (
					HAS_REFLECT &&
					Reflect.getOwnPropertyDescriptor(interfaceInstance, name)
				)
			)
		),
		['failed call interface error']: failsTypeError({
			spawnErr: () => {
				Reflect.construct(apiFunction, []); Reflect.apply(apiFunction, proto, [])
			},
		}),
		['failed apply interface error']: failsTypeError({
			spawnErr: () => {
				Reflect.construct(apiFunction, []); Reflect.apply(apiFunction, proto, [])
			},
		}),
		['failed new instance error']: failsTypeError({
			spawnErr: () => Reflect.construct(apiFunction, []),
		}),
		['failed class extends error']: !IS_WEBKIT && failsTypeError({
			spawnErr: () => {
				const ApiConstructor = apiFunction as unknown as new (...args: never[]) => object
				class Fake extends ApiConstructor { }
				void Fake
			},
		}),
		['failed null conversion error']: failsTypeError({
			spawnErr: () => Object.setPrototypeOf(apiFunction, null).toString(),
			final: restoreApiFunction,
		}),
		['failed toString']: (
			!hasKnownToString(name)[scope.Function.prototype.toString.call(apiFunction)] ||
			!hasKnownToString('toString')[scope.Function.prototype.toString.call(apiFunction.toString)]
		),
		['failed "prototype" in function']: 'prototype' in apiFunction,
		['failed descriptor']: !!(
			Object.getOwnPropertyDescriptor(apiFunction, 'arguments') ||
			Reflect.getOwnPropertyDescriptor(apiFunction, 'arguments') ||
			Object.getOwnPropertyDescriptor(apiFunction, 'caller') ||
			Reflect.getOwnPropertyDescriptor(apiFunction, 'caller') ||
			Object.getOwnPropertyDescriptor(apiFunction, 'prototype') ||
			Reflect.getOwnPropertyDescriptor(apiFunction, 'prototype') ||
			Object.getOwnPropertyDescriptor(apiFunction, 'toString') ||
			Reflect.getOwnPropertyDescriptor(apiFunction, 'toString')
		),
		['failed own property']: !!(
			Object.prototype.hasOwnProperty.call(apiFunction, 'arguments') ||
			Object.prototype.hasOwnProperty.call(apiFunction, 'caller') ||
			Object.prototype.hasOwnProperty.call(apiFunction, 'prototype') ||
			Object.prototype.hasOwnProperty.call(apiFunction, 'toString')
		),
		['failed descriptor keys']: (
			Object.keys(Object.getOwnPropertyDescriptors(apiFunction)).sort().toString() != 'length,name'
		),
		['failed own property names']: (
			Object.getOwnPropertyNames(apiFunction).sort().toString() != 'length,name'
		),
		['failed own keys names']: HAS_REFLECT && (
			Reflect.ownKeys(apiFunction).map(String).sort().toString() != 'length,name'
		),
		// Proxy Detection
		['failed object toString error']: (
			failsTypeError({
				spawnErr: () => Object.create(apiFunction).toString(),
				withStack: (err: unknown) => IS_BLINK && !hasValidStack(err, AT_FUNCTION),
			}) ||
			failsTypeError({
				spawnErr: () => Object.create(new Proxy(apiFunction, {})).toString(),
				withStack: (err: unknown) => IS_BLINK && !hasValidStack(err, AT_OBJECT),
			})
		),
		['failed at incompatible proxy error']: failsTypeError({
			spawnErr: () => {
					Reflect.get(apiFunction, 'arguments')
					Reflect.get(apiFunction, 'caller')
				},
				withStack: (err: unknown) => IS_GECKO && !hasValidStack(err, STRICT_MODE, 0),
		}),
		['failed at toString incompatible proxy error']: failsTypeError({
			spawnErr: () => {
					Reflect.get(apiFunction.toString, 'arguments')
					Reflect.get(apiFunction.toString, 'caller')
				},
				withStack: (err: unknown) => IS_GECKO && !hasValidStack(err, STRICT_MODE, 0),
		}),
		['failed at too much recursion error']: failsTypeError({
			spawnErr: () => {
				Object.setPrototypeOf(apiFunction, Object.create(apiFunction)).toString()
			},
			final: restoreApiFunction,
		}),
	}

	// conditionally increase difficulty
	const detectProxies = (
		name == 'toString' ||
		!!lieProps['Function.toString'] ||
		!!lieProps['Permissions.query']
	)
	if (detectProxies) {
		const proxy1 = new Proxy(apiFunction, {})
		const proxy2 = new Proxy(apiFunction, {})
		const proxy3 = new Proxy(apiFunction, {})

		lies = {
			...lies,
			// Advanced Proxy Detection
				['failed at too much recursion __proto__ error']: !failsTypeError({
					spawnErr: () => {
					Reflect.set(apiFunction, '__proto__', proxy1)
					Number(apiFunction)
				},
				final: restoreApiFunction,
			}),
			['failed at chain cycle error']: !failsTypeError({
				spawnErr: () => {
					Object.setPrototypeOf(proxy1, Object.create(proxy1)).toString()
				},
				final: () => restorePrototype(proxy1, nativeProto),
			}),
			['failed at chain cycle __proto__ error']: !failsTypeError({
				spawnErr: () => {
					Reflect.set(proxy2, '__proto__', proxy2)
					Number(proxy2)
				},
				final: () => restorePrototype(proxy2, nativeProto),
			}),
			['failed at reflect set proto']: HAS_REFLECT && failsTypeError({
				spawnErr: () => {
					Reflect.setPrototypeOf(apiFunction, Object.create(apiFunction))
					void (RAND in apiFunction)
					throw new TypeError()
				},
				final: restoreApiFunction,
			}),
			['failed at reflect set proto proxy']: HAS_REFLECT && !failsTypeError({
				spawnErr: () => {
					Reflect.setPrototypeOf(proxy3, Object.create(proxy3))
					void (RAND in proxy3)
				},
				final: () => restorePrototype(proxy3, nativeProto),
			}),
			['failed at instanceof check error']: IS_BLINK && (
				failsTypeError({
					spawnErr: () => {
					void (apiFunction instanceof apiFunction)
					},
					withStack: (err: unknown) => !hasValidStack(err, FUNCTION_INSTANCE),
				}) ||
				failsTypeError({
					spawnErr: () => {
						const proxy = new Proxy(apiFunction, {})
					void (proxy instanceof proxy)
					},
					withStack: (err: unknown) => !hasValidStack(err, PROXY_INSTANCE),
				})
			),
				['failed at define properties']: IS_BLINK && HAS_REFLECT && failsWithError(() => {
					try {
						Object.defineProperty(apiFunction, '', { configurable: true }).toString()
					} finally {
						Reflect.deleteProperty(apiFunction, '')
					}
			}),
		}
	}
	const lieTypes = Object.keys(lies).filter((key) => !!lies[key])
	return {
		lied: lieTypes.length,
		lieTypes,
	}
}

interface SearchConfig {
	target?: readonly string[]
	ignore?: readonly string[]
}
function createLieDetector(scope: Window & typeof globalThis) {
	const isSupported = (obj: unknown): obj is object => obj != null && (typeof obj == 'object' || typeof obj == 'function')
	const props: Record<string, string[]> = {} // lie list and detail
	const propsSearched: string[] = [] // list of properties searched
	return {
		getProps: () => Object.fromEntries(Object.entries(props).map(([name, lies]) => [name, [...lies]])),
		getPropsSearched: () => [...propsSearched],
		searchLies: (fn: () => unknown, config?: SearchConfig): void => {
			const { target, ignore } = config || {}
			let obj: object
			// check if api is blocked or not supported
			try {
				const value = fn()
				if (!isSupported(value)) {
					return
				}
				obj = value
			} catch (error) {
				return
			}

			const prototype = Reflect.get(obj, 'prototype')
			const interfaceObject = isSupported(prototype) ? prototype : obj
			const targetSet = target ? new Set(target) : undefined
			const ignoreSet = ignore ? new Set(ignore) : undefined
			;[...new Set([
				...Object.getOwnPropertyNames(interfaceObject),
				...Object.keys(interfaceObject), // backup
			])].sort().forEach((name) => {
				const skip = (
					name == 'constructor' ||
					(targetSet && !targetSet.has(name)) ||
					(ignoreSet && ignoreSet.has(name))
				)
				if (skip) return

				const objectNameString = /\s(.+)\]/
				const declaredName = Reflect.get(obj, 'name')
				const tag = Object.prototype.toString.call(obj)
				const apiName = `${typeof declaredName == 'string' && declaredName ? declaredName : objectNameString.exec(tag)?.[1] ?? 'Unknown'}.${name}`
				propsSearched.push(apiName)
				try {
					const proto = interfaceObject
					let res: LieResult

					// search if function
					try {
						const apiFunction: unknown = Reflect.get(proto, name) // may trigger TypeError
						if (typeof apiFunction == 'function') {
							res = queryLies({
								scope,
								apiFunction: apiFunction as ApiFunction,
								proto,
								obj: null,
								lieProps: props,
							})
							if (res.lied) {
								documentLie(apiName, res.lieTypes)
								return (props[apiName] = res.lieTypes)
							}
							return
						}
						// since there is no TypeError and the typeof is not a function,
						// handle invalid values and ignore name, length, and constants
						if (
							name != 'name' &&
							name != 'length' &&
							name.charAt(0) !== name.charAt(0).toUpperCase()) {
							const lie = ['failed descriptor.value undefined']
							documentLie(apiName, lie)
							return (
								props[apiName] = lie
							)
						}
					} catch (error) { }
					// else search getter function
					const getterFunction = Object.getOwnPropertyDescriptor(proto, name)?.get
					if (typeof getterFunction != 'function') return
					res = queryLies({
						scope,
						apiFunction: getterFunction,
						proto,
						obj,
						lieProps: props,
					}) // send the obj for special tests

					if (res.lied) {
						documentLie(apiName, res.lieTypes)
						return (props[apiName] = res.lieTypes)
					}
					return
				} catch (error) {
					const lie = `failed prototype test execution`
					documentLie(apiName, lie)
					return (
						props[apiName] = [lie]
					)
				}
			})
		},
	}
}

interface Phantom {
	iframeWindow: Window
	div?: HTMLDivElement | undefined
}
function getPhantomIframe(): Phantom {
	if (IS_WORKER_SCOPE) return { iframeWindow: self }
	let div: HTMLDivElement | undefined
	try {
		const frag = document.createDocumentFragment()
		div = document.createElement('div')
		const id = getRandomValues()
		div.setAttribute('id', id)
		frag.appendChild(div)
		div.innerHTML = `<div style="${GHOST}"><iframe></iframe></div>`
		document.body.appendChild(frag)
		const iframeWindow = div.querySelector('iframe')?.contentWindow
		if (!iframeWindow) return { iframeWindow: self, div }
		const phantomWindow = getBehemothIframe(iframeWindow)
		return { iframeWindow: phantomWindow || self, div }
	} catch (error) {
		captureError(error, 'client blocked phantom iframe')
		return { iframeWindow: self, div }
	}
}
let PHANTOM_DARKNESS: Window = self as Window
let PARENT_PHANTOM: HTMLDivElement | undefined

function renewPhantom(): void {
	try {
		if (PARENT_PHANTOM?.isConnected && PHANTOM_DARKNESS?.document?.body) return
	} catch {}
	removePhantom()
	const phantom = getPhantomIframe()
	PHANTOM_DARKNESS = phantom.iframeWindow
	PARENT_PHANTOM = phantom.div
}

function removePhantom(): void {
	const parent = PARENT_PHANTOM
	try {
		parent?.remove()
	} catch {
		try {
			if (parent?.parentNode) parent.parentNode.removeChild(parent)
		} catch {}
	}
	PARENT_PHANTOM = undefined
	PHANTOM_DARKNESS = self as Window
}

function getPrototypeLies(scope: Window & typeof globalThis) {
	const lieDetector = createLieDetector(scope)
	const {
		searchLies,
	} = lieDetector
	// Inspect the page's own APIs, which the other probes read. The clean
	// phantom realm (scope) is only the native Function.prototype.toString
	// reference inside the lie detector.
	const getRealmValue = (name: string): unknown => Reflect.get(self, name)
	const getRealmProperty = (parent: string, property: string): unknown => {
		const value: unknown = getRealmValue(parent)
		return value != null && (typeof value == 'object' || typeof value == 'function') ? Reflect.get(value, property) : undefined
	}

	// search lies: remove target to search all properties
	// test Function.toString first to determine the depth of the search
	searchLies(() => getRealmValue('Function'), {
		target: [
			'toString',
		],
		ignore: [
			'caller',
			'arguments',
		],
	})
	// other APIs
	searchLies(() => getRealmValue('AnalyserNode'))
	searchLies(() => getRealmValue('AudioBuffer'), {
		target: [
			'copyFromChannel',
			'getChannelData',
		],
	})
	searchLies(() => getRealmValue('BiquadFilterNode'), {
		target: [
			'getFrequencyResponse',
		],
	})
	searchLies(() => getRealmValue('CanvasRenderingContext2D'), {
		target: [
			'getImageData',
			'getLineDash',
			'isPointInPath',
			'isPointInStroke',
			'measureText',
			'quadraticCurveTo',
			'fillText',
			'strokeText',
			'font',
		],
	})
	searchLies(() => getRealmValue('CSSStyleDeclaration'), {
		target: [
			'setProperty',
		],
	})
	searchLies(() => getRealmValue('CSS2Properties'), { // Gecko
		target: [
			'setProperty',
		],
	})
	searchLies(() => getRealmValue('Date'), {
		target: [
			'getDate',
			'getDay',
			'getFullYear',
			'getHours',
			'getMinutes',
			'getMonth',
			'getTime',
			'getTimezoneOffset',
			'setDate',
			'setFullYear',
			'setHours',
			'setMilliseconds',
			'setMonth',
			'setSeconds',
			'setTime',
			'toDateString',
			'toJSON',
			'toLocaleDateString',
			'toLocaleString',
			'toLocaleTimeString',
			'toString',
			'toTimeString',
			'valueOf',
		],
	})
	searchLies(() => getRealmValue('GPU'), {
		target: [
			'requestAdapter',
		],
	})
	searchLies(() => getRealmValue('GPUAdapter'), {
		target: [
			'requestAdapterInfo',
		],
	})
	searchLies(() => getRealmProperty('Intl', 'DateTimeFormat'), {
		target: [
			'format',
			'formatRange',
			'formatToParts',
			'resolvedOptions',
		],
	})
	searchLies(() => getRealmValue('Document'), {
		target: [
			'createElement',
			'createElementNS',
			'getElementById',
			'getElementsByClassName',
			'getElementsByName',
			'getElementsByTagName',
			'getElementsByTagNameNS',
			'referrer',
			'write',
			'writeln',
		],
		ignore: [
			// Gecko
			'onreadystatechange',
			'onmouseenter',
			'onmouseleave',
		],
	})
	searchLies(() => getRealmValue('DOMRect'))
	searchLies(() => getRealmValue('DOMRectReadOnly'))
	searchLies(() => getRealmValue('Element'), {
		target: [
			'append',
			'appendChild',
			'getBoundingClientRect',
			'getClientRects',
			'insertAdjacentElement',
			'insertAdjacentHTML',
			'insertAdjacentText',
			'insertBefore',
			'prepend',
			'replaceChild',
			'replaceWith',
			'setAttribute',
		],
	})
	searchLies(() => getRealmValue('FontFace'), {
		target: [
			'family',
			'load',
			'status',
		],
	})
	searchLies(() => getRealmValue('HTMLCanvasElement'))
	searchLies(() => getRealmValue('HTMLElement'), {
		target: [
			'clientHeight',
			'clientWidth',
			'offsetHeight',
			'offsetWidth',
			'scrollHeight',
			'scrollWidth',
		],
		ignore: [
			// Gecko
			'onmouseenter',
			'onmouseleave',
		],
	})
	searchLies(() => getRealmValue('HTMLIFrameElement'), {
		target: [
			'contentDocument',
			'contentWindow',
		],
	})
	searchLies(() => getRealmValue('IntersectionObserverEntry'), {
		target: [
			'boundingClientRect',
			'intersectionRect',
			'rootBounds',
		],
	})
	searchLies(() => getRealmValue('Math'), {
		target: [
			'acos',
			'acosh',
			'asinh',
			'atan',
			'atan2',
			'atanh',
			'cbrt',
			'cos',
			'cosh',
			'exp',
			'expm1',
			'log',
			'log10',
			'log1p',
			'sin',
			'sinh',
			'sqrt',
			'tan',
			'tanh',
		],
	})
	searchLies(() => getRealmValue('MediaDevices'), {
		target: [
			'enumerateDevices',
			'getDisplayMedia',
			'getUserMedia',
		],
	})
	searchLies(() => getRealmValue('Navigator'), {
		target: [
			'appCodeName',
			'appName',
			'appVersion',
			'buildID',
			'connection',
			'deviceMemory',
			'getBattery',
			'getGamepads',
			'getVRDisplays',
			'hardwareConcurrency',
			'language',
			'languages',
			'maxTouchPoints',
			'mimeTypes',
			'oscpu',
			'platform',
			'plugins',
			'product',
			'productSub',
			'sendBeacon',
			'serviceWorker',
			'storage',
			'userAgent',
			'vendor',
			'vendorSub',
			'webdriver',
			'gpu',
		],
	})
	searchLies(() => getRealmValue('Node'), {
		target: [
			'appendChild',
			'insertBefore',
			'replaceChild',
		],
	})
	searchLies(() => getRealmValue('OffscreenCanvas'), {
		target: [
			'convertToBlob',
			'getContext',
		],
	})
	searchLies(() => getRealmValue('OffscreenCanvasRenderingContext2D'), {
		target: [
			'getImageData',
			'getLineDash',
			'isPointInPath',
			'isPointInStroke',
			'measureText',
			'quadraticCurveTo',
			'font',
		],
	})
	searchLies(() => getRealmValue('Permissions'), {
		target: [
			'query',
		],
	})
	searchLies(() => getRealmValue('Range'), {
		target: [
			'getBoundingClientRect',
			'getClientRects',
		],
	})
	searchLies(() => getRealmProperty('Intl', 'RelativeTimeFormat'), {
		target: [
			'resolvedOptions',
		],
	})
	searchLies(() => getRealmValue('Screen'))
	searchLies(() => getRealmValue('speechSynthesis'), {
		target: [
			'getVoices',
		],
	})
	searchLies(() => getRealmValue('String'), {
		target: [
			'fromCodePoint',
		],
	})
	searchLies(() => getRealmValue('StorageManager'), {
		target: [
			'estimate',
		],
	})
	searchLies(() => getRealmValue('SVGRect'))
	searchLies(() => getRealmValue('SVGRectElement'), {
		target: [
			'getBBox',
		],
	})
	searchLies(() => getRealmValue('SVGTextContentElement'), {
		target: [
			'getExtentOfChar',
			'getSubStringLength',
			'getComputedTextLength',
		],
	})
	searchLies(() => getRealmValue('TextMetrics'))
	searchLies(() => getRealmValue('WebGLRenderingContext'), {
		target: [
			'bufferData',
			'getParameter',
			'readPixels',
		],
	})
	searchLies(() => getRealmValue('WebGL2RenderingContext'), {
		target: [
			'bufferData',
			'getParameter',
			'readPixels',
		],
	})

	/* potential targets:
		RTCPeerConnection
		Plugin
		PluginArray
		MimeType
		MimeTypeArray
		Worker
		History
	*/

	// return lies list and detail
	const props = lieDetector.getProps()
	const propsSearched = lieDetector.getPropsSearched()
	return {
		lieDetector,
		lieList: Object.keys(props).sort(),
		lieDetail: props,
		lieCount: Object.keys(props).reduce((acc, key) => acc + (props[key]?.length ?? 0), 0),
		propsSearched,
	}
}

// disregard Function.prototype.toString lies when determining if the API can be trusted
const getNonFunctionToStringLies = (lies: readonly string[] | undefined): number =>
	lies?.filter((lie) => !/object toString|toString incompatible proxy/.test(lie)).length ?? 0

let lieProps: Record<string, number> = {}
let prototypeLies: Record<string, string[]> = {}
let PROTO_BENCHMARK = 0

function initializePrototypeLies(): number {
	if (IS_WORKER_SCOPE) return 0

	lieProps = {}
	prototypeLies = {}
	PROTO_BENCHMARK = 0
	try {
		// Voice discovery is intentionally warmed only as part of an explicit
		// collection. Importing the library must not touch browser detectors.
		try {
			speechSynthesis.getVoices()
		} catch (error) {}

		renewPhantom()
		const start = performance.now()
		const {
			lieDetector,
			lieDetail,
		} = getPrototypeLies(PHANTOM_DARKNESS as Window & typeof globalThis)
		const props = lieDetector.getProps()
		lieProps = Object.keys(props).reduce((acc, key) => {
			acc[key] = getNonFunctionToStringLies(props[key])
			return acc
		}, {} as Record<string, number>)
		prototypeLies = Object.fromEntries(Object.entries(lieDetail).map(([name, lies]) => [name, [...lies]]))
		PROTO_BENCHMARK = +(performance.now() - start).toFixed(2)
		return PROTO_BENCHMARK
	} catch (error) {
		captureError(error, 'prototype lie analysis failed')
		removePhantom()
		throw error
	}
}

const getPluginLies = (plugins: PluginArray, mimeTypes: MimeTypeArray) => {
	const lies: string[] = [] // collect lie types
	const pluginsOwnPropertyNames = Object.getOwnPropertyNames(plugins).filter((name) => isNaN(+name))
	const mimeTypesOwnPropertyNames = Object.getOwnPropertyNames(mimeTypes).filter((name) => isNaN(+name))

	// cast to array
	const pluginsList = [...plugins] as Plugin[]
	const mimeTypesList = [...mimeTypes] as MimeType[]

	// get initial trusted mimeType names
	const trustedMimeTypes = new Set(mimeTypesOwnPropertyNames)

	// get initial trusted plugin names
	const excludeDuplicates = <T>(values: readonly T[]): T[] => [...new Set(values)]
	const mimeTypeEnabledPlugins = excludeDuplicates(
		mimeTypesList.map((mimeType) => mimeType.enabledPlugin),
	)
	const trustedPluginNames = new Set(pluginsOwnPropertyNames)
	const mimeTypeEnabledPluginsNames = new Set(mimeTypeEnabledPlugins.map((plugin) => plugin?.name))
	const trustedPluginNamesArray = [...trustedPluginNames]
	trustedPluginNamesArray.forEach((name) => {
		const validName = mimeTypeEnabledPluginsNames.has(name)
		if (!validName) {
			trustedPluginNames.delete(name)
		}
	})

	// 3. Expect MimeType object in plugins
	const invalidPlugins = pluginsList.filter((plugin) => {
		try {
			const firstMimeType = plugin[0]
			const validMimeType = firstMimeType !== undefined && Object.getPrototypeOf(firstMimeType).constructor.name == 'MimeType'
			if (!validMimeType) {
				trustedPluginNames.delete(plugin.name)
			}
			return !validMimeType
		} catch (error) {
			trustedPluginNames.delete(plugin.name)
			return true // sign of tampering
		}
	})
	if (invalidPlugins.length) {
		lies.push('missing mimetype')
	}

	// 4. Expect valid MimeType(s) in plugin
	pluginsList.forEach((plugin) => {
		const pluginMimeTypes = [...plugin].map((mimeType) => mimeType.type)
		return pluginMimeTypes.forEach((mimetype) => {
			if (!trustedMimeTypes.has(mimetype)) {
				lies.push('invalid mimetype')
				return trustedPluginNames.delete(plugin.name)
			}
			return
		})
	})

	return {
		validPlugins: pluginsList.filter((plugin) => trustedPluginNames.has(plugin.name)),
		validMimeTypes: mimeTypesList.filter((mimeType) => trustedMimeTypes.has(mimeType.type)),
		lies: [...new Set(lies)], // remove duplicates
	}
}

const getLies = () => {
	const records = lieRecords.getRecords()
	const totalLies = Object.keys(records).reduce((acc, key) => {
		acc += records[key]?.length ?? 0
		return acc
	}, 0)
	return { data: records, totalLies }
}

export { getRandomValues, documentLie, createLieDetector, PHANTOM_DARKNESS, PARENT_PHANTOM, renewPhantom, removePhantom, initializePrototypeLies, lieProps, prototypeLies, lieRecords, getLies, getPluginLies, PROTO_BENCHMARK }
