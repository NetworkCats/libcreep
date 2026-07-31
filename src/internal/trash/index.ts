
// Detect proxy behavior
const proxyBehavior = (x: unknown): boolean => typeof x == 'function'

const GIBBERS = /[cC]f|[jJ][bcdfghlmprsty]|[qQ][bcdfghjklmnpsty]|[vV][bfhjkmpt]|[xX][dkrz]|[yY]y|[zZ][fr]|[cCxXzZ]j|[bBfFgGjJkKpPvVqQtTwWyYzZ]q|[cCfFgGjJpPqQwW]v|[jJqQvV]w|[bBcCdDfFgGhHjJkKmMpPqQsSvVwWxXzZ]x|[bBfFhHjJkKmMpPqQ]z/

// Detect gibberish
const gibberish = (str: string, {strict = false} = {}): string[] => {
	if (!str) return []

	// test letter case sequence
	const letterCaseSequenceGibbers: string[] = []
	const tests = [
		/([A-Z]{3,}[a-z])/g, // ABCd
		/([a-z][A-Z]{3,})/g, // aBCD
		/([a-z][A-Z]{2,}[a-z])/g, // aBC...z
		/([a-z][\d]{2,}[a-z])/g, // a##...b
		/([A-Z][\d]{2,}[a-z])/g, // A##...b
		/([a-z][\d]{2,}[A-Z])/g, // a##...B
	]
	tests.forEach((regExp) => {
		const match = str.match(regExp)
		if (match) {
			return letterCaseSequenceGibbers.push(match.join(', '))
		}
		return
	})

	// test letter sequence
	const letterSequenceGibbers: string[] = []
	const clean = str.replace(/\d|\W|_/g, ' ').replace(/\s+/g, ' ').trim().split(' ').join('_')
	const len = clean.length
	const arr = [...clean]

	arr.forEach((char, index) => {
		const nextIndex = index + 1
		const nextChar = arr[nextIndex]
		const isWordSequence = nextChar !== '_' && char !== '_' && nextIndex !== len

		if (isWordSequence) {
			const combo = char + nextChar
			if (GIBBERS.test(combo)) letterSequenceGibbers.push(combo)
		}
	})

	const gibbers = [
		// ignore sequence if less than 3 exist
		...(!strict && (letterSequenceGibbers.length < 3) ? [] : letterSequenceGibbers),
		...(!strict && (letterCaseSequenceGibbers.length < 4) ? [] : letterCaseSequenceGibbers),
	]

	const allow = [
		// known gibbers
		'bz',
		'cf',
		'fx',
		'mx',
		'vb',
		'xd',
		'gx',
		'PCIe',
		'vm',
		'NVIDIAGa',
	]
	return gibbers.filter((x) => !allow.includes(x))
}

// validate
const isInt = (x: unknown): x is number => typeof x == 'number' && x % 1 == 0
const trustInteger = (name: string, val: unknown): number | undefined => {
	const trusted = isInt(val)
	return trusted ? val : sendToTrash(name, val)
}

// WebGL Renderer helpers
function compressWebGLRenderer(x: unknown): string | undefined {
	if (!x) return

	let renderer: string
	try {
		renderer = String(x)
	} catch {
		return
	}
	return renderer
		.replace(/ANGLE \(|\sDirect3D.+|\sD3D.+|\svs_.+\)|\((DRM|POLARIS|LLVM).+|Mesa.+|(ATI|INTEL)-.+|Metal\s-\s.+|NVIDIA\s[\d.]+/ig, '')
	.replace(/(\s(ti|\d{1,2}GB|super)$)/ig, '')
	.replace(/\s{2,}/g, ' ')
	.trim()
	.replace(/((r|g)(t|)(x|s|\d) |Graphics |GeForce |Radeon (HD |Pro |))(\d+)/i, (...args) => {
		return `${args[1]}${args[6][0]}${args[6].slice(1).replace(/\d/g, '0')}s`
	})
}

const getWebGLRendererParts = (x: unknown): string => {
    const knownParts = [
		'AMD',
		'ANGLE',
		'ASUS',
		'ATI',
		'ATI Radeon',
		'ATI Technologies Inc',
		'Adreno',
		'Android Emulator',
		'Apple',
		'Apple GPU',
		'Apple M1',
		'Chipset',
		'D3D11',
		'Direct3D',
		'Express Chipset',
		'GeForce',
		'Generation',
		'Generic Renderer',
		'Google',
		'Google SwiftShader',
		'Graphics',
		'Graphics Media Accelerator',
		'HD Graphics Family',
		'Intel',
		'Intel(R) HD Graphics',
		'Intel(R) UHD Graphics',
		'Iris',
		'KBL Graphics',
		'Mali',
		'Mesa',
		'Mesa DRI',
		'Metal',
		'Microsoft',
		'Microsoft Basic Render Driver',
		'Microsoft Corporation',
		'NVIDIA',
		'NVIDIA Corporation',
		'NVIDIAGameReadyD3D',
		'OpenGL',
		'OpenGL Engine',
		'Open Source Technology Center',
		'Parallels',
		'Parallels Display Adapter',
		'PCIe',
		'Plus Graphics',
		'PowerVR',
		'Pro Graphics',
		'Quadro',
		'Radeon',
		'Radeon Pro',
		'Radeon Pro Vega',
		'Samsung',
		'SSE2',
		'VMware',
		'VMware SVGA 3D',
		'Vega',
		'VirtualBox',
		'VirtualBox Graphics Adapter',
		'Vulkan',
		'Xe Graphics',
		'llvmpipe',
    ]
	let renderer
	try {
		renderer = String(x)
	} catch {
		return ''
	}
	const parts = [...knownParts].filter((name) => renderer.includes(name))
    return [...new Set(parts)].sort().join(', ')
}

const hardenWebGLRenderer = (x: unknown): unknown => {
	const gpuHasKnownParts = getWebGLRendererParts(x).length
	return gpuHasKnownParts ? compressWebGLRenderer(x) : x
}

interface WebGLRendererConfidence {
	parts: string
	warnings: string[]
	gibbers: string
	confidence: 'high' | 'moderate' | 'low'
	grade: 'A' | 'C' | 'F'
}

const getWebGLRendererConfidence = (x: unknown): WebGLRendererConfidence | undefined => {
	if (!x) {
		return
	}
	let renderer
	try {
		renderer = String(x)
	} catch {
		return
	}
	const parts = getWebGLRendererParts(renderer)
	const hasKnownParts = parts.length
	const hasBlankSpaceNoise = /\s{2,}|^\s|\s$/.test(renderer)
	const hasBrokenAngleStructure = renderer.startsWith('ANGLE') && !(/^ANGLE \((.+)\)/.exec(renderer)||[])[1]

	// https://chromium.googlesource.com/angle/angle/+/83fa18905d8fed4f394e4f30140a83a3e76b1577/src/gpu_info_util/SystemInfo.cpp
	// https://chromium.googlesource.com/angle/angle/+/83fa18905d8fed4f394e4f30140a83a3e76b1577/src/gpu_info_util/SystemInfo.h
	// https://chromium.googlesource.com/chromium/src/+/refs/heads/main/ui/gl/gl_version_info.cc
	/*
	const knownVendors = [
		'AMD',
		'ARM',
		'Broadcom',
		'Google',
		'ImgTec',
		'Intel',
		'Kazan',
		'NVIDIA',
		'Qualcomm',
		'VeriSilicon',
		'Vivante',
		'VMWare',
		'Apple',
		'Unknown'
	]
	const angle = {
		vendorId: (/^ANGLE \(([^,]+),/.exec(x)||[])[1] || knownVendors.find(vendor => x.includes(vendor)),
		deviceId: (
			(x.match(/,/g)||[]).length == 2 ? (/^ANGLE \(([^,]+), ([^,]+)[,|\)]/.exec(x)||[])[2] :
				(/^ANGLE \(([^,]+), ([^,]+)[,|\)]/.exec(x)||[])[1] || (/^ANGLE \((.+)\)$/.exec(x)||[])[1]
		).replace(/\sDirect3D.+/, '')
	}
	*/

	const gibbers = gibberish(renderer, { strict: true }).join(', ')
	const valid = (
		hasKnownParts && !hasBlankSpaceNoise && !hasBrokenAngleStructure
	)
	const confidence = (
		valid && !gibbers.length? 'high' :
		valid && gibbers.length ? 'moderate' :
			'low'
	)
	const grade = (
		confidence == 'high' ? 'A' :
			confidence == 'moderate' ? 'C' :
				'F'
	)

	const warnings: string[] = []
	if (hasBlankSpaceNoise) warnings.push('found extra spaces')
	if (hasBrokenAngleStructure) warnings.push('broken angle structure')

	return {
		parts,
		warnings,
		gibbers,
		confidence,
		grade,
	}
}

// Collect trash values
const createTrashBin = () => {
	const bin: unknown[] = []
	  return {
				getBin: () => bin.slice(),
			resetBin: (baseline: unknown[] = []) => {
				bin.splice(0, bin.length, ...baseline)
			},
		sendToTrash: <T = undefined>(name: string, val: unknown, response?: T): T | undefined => {
			const proxyLike = proxyBehavior(val)
			const value = !proxyLike ? val : 'proxy behavior detected'
			bin.push({ name, value })
			return response
		},
	}
}

const trashBin = createTrashBin()
const { sendToTrash } = trashBin
const getTrash = () => ({ trashBin: trashBin.getBin() })

export { sendToTrash, proxyBehavior, gibberish, trustInteger, compressWebGLRenderer, getWebGLRendererParts, hardenWebGLRenderer, getWebGLRendererConfidence, trashBin, getTrash }
