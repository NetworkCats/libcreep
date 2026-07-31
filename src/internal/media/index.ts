import { captureError } from '../errors'

import { createTimer, logTestResult } from '../utils/helpers'
// inspired by
// - https://privacycheck.sec.lrz.de/active/fp_cpt/fp_can_play_type.html
// - https://arkenfox.github.io/TZP
const getMimeTypeShortList = () =>
	[
		'audio/ogg; codecs="vorbis"',
		'audio/mpeg',
		'audio/mpegurl',
		'audio/wav; codecs="1"',
		'audio/x-m4a',
		'audio/aac',
		'video/ogg; codecs="theora"',
		'video/quicktime',
		'video/mp4; codecs="avc1.42E01E"',
		'video/webm; codecs="vp8"',
		'video/webm; codecs="vp9"',
		'video/x-matroska',
	].sort()

interface MimeTypeSupport {
	mimeType: string
	audioPlayType: CanPlayTypeResult
	videoPlayType: CanPlayTypeResult
	mediaSource: boolean
	mediaRecorder: boolean
}

const safely = <T>(probe: () => T, fallback: T): T => {
	try {
		return probe()
	} catch {
		return fallback
	}
}

const getIsTypeSupported = (target: unknown): ((type: string) => boolean) | undefined => {
	try {
		if (target == null || (typeof target != 'object' && typeof target != 'function')) return
		const method = Reflect.get(target, 'isTypeSupported')
		if (typeof method != 'function') return
		return (type) => Boolean(Reflect.apply(method, target, [type]))
	} catch {
		return
	}
}

const readWindowProperty = (key: PropertyKey): unknown => {
	try {
		return Reflect.get(window, key)
	} catch {
		return undefined
	}
}

export default async function getMedia() {
	const getMimeTypes = () => {
		const mimeTypes = getMimeTypeShortList()
		const videoEl = document.createElement('video')
		const audioEl = document.createElement('audio')
		const isMediaSourceSupported = getIsTypeSupported(readWindowProperty('MediaSource'))
		const isMediaRecorderSupported = getIsTypeSupported(readWindowProperty('MediaRecorder'))
		const types = mimeTypes.reduce<MimeTypeSupport[]>((acc, type) => {
			const data = {
				mimeType: type,
				audioPlayType: safely(() => audioEl.canPlayType(type), '' as CanPlayTypeResult),
				videoPlayType: safely(() => videoEl.canPlayType(type), '' as CanPlayTypeResult),
				mediaSource: isMediaSourceSupported ? safely(() => isMediaSourceSupported(type), false) : false,
				mediaRecorder: isMediaRecorderSupported ? safely(() => isMediaRecorderSupported(type), false) : false,
			}
			if (!data.audioPlayType && !data.videoPlayType && !data.mediaSource && !data.mediaRecorder) {
				return acc
			}
			acc.push(data)
			return acc
		}, [])
		return types
	}

	try {
		const timer = createTimer()
		timer.start()
		const mimeTypes = getMimeTypes()

		logTestResult({ time: timer.stop(), test: 'media', passed: true })
		return { mimeTypes }
	} catch (error) {
		logTestResult({ test: 'media', passed: false })
		captureError(error)
		throw error
	}
}
