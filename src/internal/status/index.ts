// @ts-nocheck

const GIGABYTE = 1073741824 // bytes

function getMaxCallStackSize(): number {
  const fn = (): number => {
    try {
      return 1+fn()
    } catch (err) {
      return 1
    }
  }
  ;[...Array(10)].forEach(() => fn()) // stabilize
  return fn()
}

// based on and inspired by
// https://github.com/Joe12387/OP-Fingerprinting-Script/blob/main/opfs.js#L443
function getTimingResolution(): [number, number] {
  const maxRuns = 5000
  let valA = 1
  let valB = 1
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

  return [valA, valB]
}

function getClientLitter(): string[] {
  try {
    const iframe = document.createElement('iframe')
    document.body.appendChild(iframe)
    const iframeWindow = iframe.contentWindow
    const windowKeys = Object.getOwnPropertyNames(window)
    const iframeKeys = Object.getOwnPropertyNames(iframeWindow)
    document.body.removeChild(iframe)
    const clientKeys = windowKeys.filter((x) => !iframeKeys.includes(x))
    return clientKeys
  } catch (err) {
    return []
  }
}

function getClientCode(): string[] {
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
    if (/_$/.test(key)) return true
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
async function getBattery(): Promise<BatteryManager | null> {
  if (!('getBattery' in navigator)) return null
  // @ts-expect-error if not supported
  return navigator.getBattery()
}

export async function getStorage(): Promise<number | null> {
  if (!navigator?.storage?.estimate) return null
  return Promise.all([
    navigator.storage.estimate().then(({ quota }) => quota),
    new Promise((resolve) => {
      // @ts-expect-error if not supported
      navigator.webkitTemporaryStorage.queryUsageAndQuota((_, quota) => {
        resolve(quota)
      })
    }).catch(() => null),
  ]).then(([quota1, quota2]) => (quota2 || quota1) as number)
}

async function getScriptSize(): Promise<number | null> {
  let url = null
  try {
    // @ts-expect-error if unsupported
    url = document?.currentScript?.src || import.meta.url
  } catch (err) { }

  if (!url) return null
  return fetch(url)
    .then((res) => res.blob())
    .then((blob) => blob.size)
    .catch(() => null)
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
export async function getStatus(): Promise<Status> {
  const [
    batteryInfo,
    quotaA,
    quotaB,
    scriptSize,
    stackSize,
    timingRes,
    clientLitter,
  ] = await Promise.all([
    getBattery(),
    getStorage(),
    getStorage(),
    getScriptSize(),
    getMaxCallStackSize(),
    getTimingResolution(),
    [...new Set([...getClientLitter(), ...getClientCode()])].sort().slice(0, 50),
  ])

  // BatteryManager
  const {
    charging,
    chargingTime,
    dischargingTime,
    level,
  } = batteryInfo || {}

  // MemoryInfo
  // @ts-expect-error if not supported
  const memory = performance?.memory?.jsHeapSizeLimit || null
  const memoryInGigabytes = memory ? +(memory/GIGABYTE).toFixed(2) : null

  // StorageManager
  const quotaInGigabytes = quotaA ? +(+(quotaA)/GIGABYTE).toFixed(2) : null

  // Network Info
  const {
    downlink, effectiveType, rtt, saveData, downlinkMax, type,
    // @ts-expect-error if not supported
  } = navigator?.connection as NetworkInformation & {
    downlink?: number,
    effectiveType?: string,
    rtt?: number,
    saveData?: boolean,
    downlinkMax?: number,
  } || {}

  const scripts: string[] = [
    ...document.querySelectorAll('script'),
  ].map((x) => x.src.replace(/^https?:\/\//, '')).slice(0, 10)

  return {
    charging,
    chargingTime,
    dischargingTime,
    level,
    memory,
    memoryInGigabytes,
    quota: quotaA,
    quotaIsInsecure: quotaA !== quotaB,
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
