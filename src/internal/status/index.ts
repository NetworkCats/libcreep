
const GIGABYTE = 1073741824 // bytes
const ASYNC_PROBE_TIMEOUT_MS = 3000

function getMaxCallStackSize(): number {
  const fn = (): number => {
    try {
      return 1+fn()
	    } catch {
      return 1
    }
  }
  ;[...Array(10)].forEach(() => fn()) // stabilize
  return fn()
}

// based on and inspired by
// https://github.com/Joe12387/OP-Fingerprinting-Script/blob/main/opfs.js#L443
export function getTimingResolution(): [number, number] {
  const maxRuns = 5000
  let valA = Infinity
  let valB = Infinity
  let res

  for (let i = 0; i < maxRuns; i++) {
    const a = performance.now()
    const b = performance.now()
    if (a < b) {
      res = b - a
      if (res > valA && res < valB) {
        valB = res
      } else if (res < valA) {
        valB = valA
        valA = res
      }
    }
  }

  const resolution = Number.isFinite(valA) ? valA : 0
  return [resolution, Number.isFinite(valB) ? valB : resolution]
}

function getClientLitter(): string[] {
  let iframe: HTMLIFrameElement | undefined
  try {
    iframe = document.createElement('iframe')
    iframe.hidden = true
    document.body.appendChild(iframe)
    const iframeWindow = iframe.contentWindow
    const windowKeys = Object.getOwnPropertyNames(window)
    const iframeKeys = Object.getOwnPropertyNames(iframeWindow)
    const clientKeys = windowKeys.filter((x) => !iframeKeys.includes(x))
    return clientKeys
	  } catch {
    return []
  } finally {
    iframe?.remove()
  }
}

function getClientCode(): string[] {
  if (typeof window == 'undefined') return []
  const limit = 50
  const names = Object.getOwnPropertyNames(window).slice(-limit)
  const [p1, p2] = (1).constructor.toString().split((1).constructor.name)
  const isEngine = (fn: unknown) => {
    return (
      typeof fn === 'function' &&
      (''+fn === p1 + fn.name + p2 || ''+fn === p1 + (fn.name || '').replace('get ', '') + p2)
    )
  }
  const isClient = (key: string) => {
	    if (key.endsWith('_')) return true
    const d = Object.getOwnPropertyDescriptor(window, key)
    if (!d) return true
    return key === 'chrome' ? names.includes(key) : !isEngine(d.get || d.value)
  }
  return Object.keys(window)
    .slice(-limit)
    .filter((x) => isClient(x))
}

interface BatteryManager {
  charging: boolean
  chargingTime: number
  dischargingTime: number
  level: number
}
interface LegacyTemporaryStorage {
  queryUsageAndQuota(
    success: (usage: number, quota: number) => void,
    failure?: (error?: unknown) => void,
  ): void
}

interface NetworkInformationLike {
  downlink?: number
  downlinkMax?: number
  effectiveType?: string
  rtt?: number
  saveData?: boolean
  type?: string
}

type ExtendedNavigator = Navigator & {
  connection?: NetworkInformationLike
  getBattery?: () => Promise<BatteryManager>
  webkitTemporaryStorage?: LegacyTemporaryStorage
}

const getAbortReason = (signal?: AbortSignal) => (
  signal?.reason ?? new DOMException('Status detection was aborted.', 'AbortError')
)

const throwIfAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) throw getAbortReason(signal)
}

function settleWithin<T, F>(
	promise: Promise<T>,
	fallback: F,
	signal?: AbortSignal,
): Promise<T | F> {
	throwIfAborted(signal)
	return new Promise<T | F>((resolve, reject) => {
		let settled = false
		let timeout: ReturnType<typeof setTimeout> | undefined
		const finish = (value: T | unknown, rejected: boolean) => {
			if (settled) return
			settled = true
			clearTimeout(timeout)
			signal?.removeEventListener('abort', abort)
			if (rejected) reject(value)
			else resolve(value as T | F)
		}
		const abort = () => finish(getAbortReason(signal), true)
		timeout = setTimeout(() => finish(fallback, false), ASYNC_PROBE_TIMEOUT_MS)
		signal?.addEventListener('abort', abort, { once: true })
		if (signal?.aborted) return abort()
		promise.then(
			(value) => finish(value, false),
			() => finish(fallback, false),
		)
	})
}

async function getBattery(signal?: AbortSignal): Promise<BatteryManager | null> {
	throwIfAborted(signal)
	const browserNavigator = navigator as ExtendedNavigator
	if (typeof browserNavigator.getBattery != 'function') return null
	return settleWithin(
		Promise.resolve().then(() => browserNavigator.getBattery!()),
		null,
		signal,
	)
}

export async function getStorage(signal?: AbortSignal): Promise<number | null> {
  throwIfAborted(signal)
  const browserNavigator = navigator as ExtendedNavigator
  const quotaFromEstimate = typeof browserNavigator.storage?.estimate != 'function' ?
    Promise.resolve(null) :
		settleWithin(
			Promise.resolve().then(() => browserNavigator.storage.estimate()),
			null,
			signal,
			).then((estimate) => {
				const quota = estimate?.quota
				return typeof quota == 'number' && Number.isFinite(quota) ? quota : null
			})
  const legacyStorage = browserNavigator.webkitTemporaryStorage
  const queryUsageAndQuota = legacyStorage?.queryUsageAndQuota
  const quotaFromLegacyApi = typeof queryUsageAndQuota != 'function' ? Promise.resolve(null) :
		settleWithin(new Promise<number | null>((resolve) => {
			queryUsageAndQuota.call(
        legacyStorage,
        (_usage: number, quota: number) => resolve(Number.isFinite(quota) ? quota : null),
        () => resolve(null),
			)
		}), null, signal)
  return Promise.all([
    quotaFromEstimate,
    quotaFromLegacyApi,
  ]).then(([quota1, quota2]) => quota2 ?? quota1)
}

function getScriptSize(): number | null {
  let url: string
  try {
    const currentScript = document.currentScript
    const currentScriptSource =
      currentScript === null ? undefined : Reflect.get(currentScript, 'src')
    url =
      typeof currentScriptSource == 'string' && currentScriptSource
        ? currentScriptSource
        : import.meta.url
  } catch {
    return null
  }

  try {
    if (!url || typeof performance.getEntriesByName != 'function') return null
    const entries = performance.getEntriesByName(url, 'resource')
    const entry = entries.at(-1)
    if (!entry || !('decodedBodySize' in entry)) return null
    const decodedBodySize: unknown = Reflect.get(entry, 'decodedBodySize')
    return typeof decodedBodySize == 'number' &&
      Number.isFinite(decodedBodySize) &&
      decodedBodySize >= 0
      ? decodedBodySize
      : null
  } catch {
    return null
  }
}

interface Status {
    charging?: boolean
    chargingTime?: number
    dischargingTime?: number
    level?: number
    memory: number | null
    memoryInGigabytes: number | null
    quota: number | null
    quotaIsInsecure: boolean | null
    quotaInGigabytes: number | null
    downlink?: number
    effectiveType?: string
    rtt?: number | undefined
    saveData?: boolean
    downlinkMax?: number
    type?: string
    stackSize: number
    timingRes: [number, number]
    clientLitter: string[]
    scripts: string[]
    scriptSize: number | null
}
export async function getStatus(signal?: AbortSignal): Promise<Status> {
  const [
    batteryInfo,
    quotaA,
    quotaB,
    scriptSize,
    stackSize,
    timingRes,
    clientLitter,
  ] = await Promise.all([
    getBattery(signal),
    getStorage(signal),
    getStorage(signal),
    getScriptSize(),
    getMaxCallStackSize(),
    getTimingResolution(),
    [...new Set([...getClientLitter(), ...getClientCode()])].sort().slice(0, 50),
  ])
  throwIfAborted(signal)

  // BatteryManager
  const {
    charging,
    chargingTime,
    dischargingTime,
    level,
  } = batteryInfo || {}

  // MemoryInfo
  const memoryValue = (performance as Performance & {
    memory?: { jsHeapSizeLimit?: unknown }
  }).memory?.jsHeapSizeLimit
  const memory = typeof memoryValue == 'number' && Number.isFinite(memoryValue) ? memoryValue : null
  const memoryInGigabytes = memory == null ? null : +(memory/GIGABYTE).toFixed(2)

  // StorageManager
  const quotaInGigabytes = quotaA == null ? null : +(quotaA/GIGABYTE).toFixed(2)

  // Network Info
  const {
    downlink, effectiveType, rtt, saveData, downlinkMax, type,
  } = (navigator as ExtendedNavigator).connection || {}

  const scripts: string[] = [
    ...document.querySelectorAll('script'),
  ].map((x) => x.src.replace(/^https?:\/\//, '')).filter(Boolean).slice(0, 10)

  const quotaIsInsecure = quotaA == null || quotaB == null ? null : quotaA !== quotaB

  return {
    charging,
    chargingTime,
    dischargingTime,
    level,
    memory,
    memoryInGigabytes,
    quota: quotaA,
    quotaIsInsecure,
    quotaInGigabytes,
    downlink,
    effectiveType,
    rtt,
    saveData,
    downlinkMax,
    type,
    stackSize,
    timingRes,
    clientLitter,
    scripts,
    scriptSize,
  }
}
