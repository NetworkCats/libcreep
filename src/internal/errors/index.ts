
const createErrorsCaptured = () => {
	const errors: unknown[] = []
	const errorTypes = new Set([
		'Error',
		'EvalError',
		'InternalError',
		'RangeError',
		'ReferenceError',
		'SyntaxError',
		'TypeError',
		'URIError',
		'InvalidStateError',
		'SecurityError',
	])
	const readErrorProperty = (error: unknown, property: 'name' | 'message'): unknown => {
		try {
			return error != null && (typeof error == 'object' || typeof error == 'function') ?
				Reflect.get(error, property) : undefined
		} catch {
			return undefined
		}
	}
	const toString = (value: unknown): string | undefined => {
		try {
			return typeof value == 'string' ? value : value == null ? undefined : String(value)
		} catch {
			return undefined
		}
	}
	return {
		getErrors: () => errors.slice(),
		captureError: (error: unknown, customMessage: unknown = '') => {
			const hasInnerSpace = (s: string) => /.+\s.+/.test(s) // ignore AOPR noise
			const name = toString(readErrorProperty(error, 'name'))
			const message = toString(readErrorProperty(error, 'message'))
			const context = toString(customMessage)
			const trustedMessage = (
				!message || !hasInnerSpace(message) ? undefined :
					!context ? message :
						`${message} [${context}]`
			)
			const trustedName = name && errorTypes.has(name) ? name : undefined
			errors.push(
				{ trustedName, trustedMessage },
			)
			return undefined
		},
		resetErrors: (baseline: unknown[] = []) => {
			errors.splice(0, errors.length, ...baseline)
		},
	}
}
const errorsCaptured = createErrorsCaptured()
const { captureError } = errorsCaptured

function attempt<T>(fn: () => Promise<T>, customMessage?: string): Promise<T | undefined>
function attempt<T>(fn: () => T, customMessage?: string): T | undefined
function attempt<T>(fn: () => T | Promise<T>, customMessage = ''): T | Promise<T | undefined> | undefined {
	try {
		const result = fn()
		const isThenable = result != null &&
			(typeof result == 'object' || typeof result == 'function') &&
			typeof Reflect.get(result, 'then') == 'function'
		return isThenable ? Promise.resolve(result).catch((error) => (
			captureError(error, customMessage)
		)) : result
	} catch (error) {
		if (customMessage) {
			return captureError(error, customMessage)
		}
		return captureError(error)
	}
}

function caniuse<T>(fn: () => T): T | undefined
function caniuse<T>(
	fn: () => unknown,
	objChainList: PropertyKey[],
	args?: unknown[],
	method?: boolean,
): T | undefined
function caniuse<T>(
	fn: () => T,
	objChainList: PropertyKey[] = [],
	args: unknown[] = [],
	method = false,
): T | undefined {
	let api: unknown
	try {
		api = fn()
	} catch {
		return undefined
	}
	let i
	const len = objChainList.length
	let chain: unknown = api
	let receiver: unknown = api
	try {
		for (i = 0; i < len; i++) {
			const obj = objChainList[i]
			if (obj === undefined || chain == null || (typeof chain != 'object' && typeof chain != 'function')) {
				return undefined
			}
			receiver = chain
			chain = Reflect.get(chain, obj)
		}
		return (method && typeof chain == 'function' ? Reflect.apply(chain, receiver, args) : chain) as T
	} catch {
		return undefined
	}
}

// Log performance time
const timer = (logStart?: string) => {
	if (logStart) console.log(logStart)
	let start = 0
	try {
		start = performance.now()
	} catch (error) {
		captureError(error)
	}
	return (logEnd?: string) => {
		let end = 0
		try {
			end = performance.now() - start
			if (logEnd) console.log(`${logEnd}: ${end / 1000} seconds`)
			return end
		} catch (error) {
			captureError(error)
			return 0
		}
	}
}

const getCapturedErrors = () => ({ data: errorsCaptured.getErrors() })

export { captureError, attempt, caniuse, timer, errorsCaptured, getCapturedErrors }
