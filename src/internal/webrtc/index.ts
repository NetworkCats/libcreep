const settleWithin = <T>(operation: PromiseLike<T>, label: string, limit: number = 3000): Promise<T> =>
	new Promise((resolve, reject) => {
		let settled = false
		const finish = (callback: () => void) => {
			if (settled) return
			settled = true
			clearTimeout(timeout)
			callback()
		}
		const timeout = setTimeout(
			() =>
				finish(() => {
					const error = new Error(`${label} timed out after ${limit}ms`)
					error.name = 'TimeoutError'
					reject(error)
				}),
			limit,
		)
		void Promise.resolve(operation).then(
			(value) => finish(() => resolve(value)),
			(error: unknown) => finish(() => reject(error)),
		)
	})

export async function getWebRTCDevices(): Promise<MediaDeviceKind[] | null> {
	if (!navigator?.mediaDevices?.enumerateDevices) return null
	return settleWithin(navigator.mediaDevices.enumerateDevices(), 'Media device enumeration').then((devices) => {
		return devices.map((device) => device.kind).sort()
	})
}

const getMediaConfig = (
	codec: string,
	video: Omit<VideoConfiguration, 'contentType'>,
	audio: Omit<AudioConfiguration, 'contentType'>,
): MediaDecodingConfiguration => ({
	type: 'file',
	video: !codec.startsWith('video')
		? undefined
		: {
				contentType: codec,
				...video,
			},
	audio: !codec.startsWith('audio')
		? undefined
		: {
				contentType: codec,
				...audio,
			},
})

export const getMediaCapabilities = async () => {
	if (typeof navigator?.mediaCapabilities?.decodingInfo != 'function') return null
	const video = {
		width: 1920,
		height: 1080,
		bitrate: 120000,
		framerate: 60,
	}

	const audio = {
		channels: '2',
		bitrate: 300000,
		samplerate: 5200,
	}

	const codecs = [
		'audio/ogg; codecs=vorbis',
		'audio/ogg; codecs=flac',
		'audio/mp4; codecs="mp4a.40.2"',
		'audio/mpeg; codecs="mp3"',
		'video/ogg; codecs="theora"',
		'video/mp4; codecs="avc1.42E01E"',
	]

	const decodingInfo = codecs.map((codec) => {
		const config = getMediaConfig(codec, video, audio)
		return settleWithin(navigator.mediaCapabilities.decodingInfo(config), `Media capability probe for ${codec}`)
			.then((support) => ({
				codec,
				...support,
			}))
			.catch(() => undefined)
	})

	const capabilities = await Promise.all(decodingInfo)
		.then((data) => {
			return data.reduce<Record<string, string[]>>((acc, support) => {
				const { codec, supported, smooth, powerEfficient } = support || {}
				if (!supported) return acc
				return {
					...acc,
					['' + codec]: [...(smooth ? ['smooth'] : []), ...(powerEfficient ? ['efficient'] : [])],
				}
			}, {})
		})
		.catch(() => undefined)

	return capabilities
}

const getExtensions = (sdp?: string): string[] => {
	const extensions = (('' + sdp).match(/extmap:\d+ [^\n|\r]+/g) || []).map((x) => x.replace(/extmap:[^\s]+ /, ''))
	return [...new Set(extensions)].sort()
}

const createCounter = () => {
	let counter = 0
	return {
		increment: () => (counter += 1),
		getValue: () => counter,
	}
}

type Counter = ReturnType<typeof createCounter>

interface CodecDescription {
	channels?: number
	mimeType?: string
	clockRates?: number[]
	feedbackSupport?: string[]
	sdpFmtpLine?: string[]
}

interface DescriptionInput {
	mediaType: 'audio' | 'video'
	sdp: string
	sdpDescriptors: string[]
	rtxCounter: Counter
}

// https://webrtchacks.com/sdp-anatomy/
// https://tools.ietf.org/id/draft-ietf-rtcweb-sdp-08.html
const constructDescriptions = ({
	mediaType,
	sdp,
	sdpDescriptors,
	rtxCounter,
}: DescriptionInput): CodecDescription[] | undefined => {
	if (!('' + sdpDescriptors)) {
		return
	}
	return sdpDescriptors.reduce<CodecDescription[]>((descriptionAcc, descriptor) => {
		const matcher = `(rtpmap|fmtp|rtcp-fb):${descriptor} (.+)`
		const formats = sdp.match(new RegExp(matcher, 'g')) || []
		if (!('' + formats)) {
			return descriptionAcc
		}
		const isRtxCodec = ('' + formats).includes(' rtx/')
		if (isRtxCodec) {
			if (rtxCounter.getValue()) {
				return descriptionAcc
			}
			rtxCounter.increment()
		}
		const getLineData = (x: string) => x.replace(/[^\s]+ /, '')
		const description = formats.reduce<CodecDescription>((acc, x) => {
			const rawData = getLineData(x)
			const data = rawData.split('/')
			const codec = data[0]
			if (!codec) return acc
			const description: CodecDescription = {}

			if (x.includes('rtpmap')) {
				if (mediaType == 'audio') {
					description.channels = Number(data[2] ?? '') || 1
				}
				description.mimeType = `${mediaType}/${codec}`
				description.clockRates = [Number(data[1] ?? '')]
				return {
					...acc,
					...description,
				}
			} else if (x.includes('rtcp-fb')) {
				return {
					...acc,
					feedbackSupport: [...(acc.feedbackSupport || []), rawData],
				}
			} else if (isRtxCodec) {
				return acc // no sdpFmtpLine
			}
			return { ...acc, sdpFmtpLine: rawData.split(';') }
		}, {})

		let didMerge = false
		const mergerAcc = descriptionAcc.map((x) => {
			if (x.mimeType != description.mimeType) return x
			didMerge = true
			const feedbackSupport = [...new Set([...(x.feedbackSupport || []), ...(description.feedbackSupport || [])])]
			const sdpFmtpLine = [...new Set([...(x.sdpFmtpLine || []), ...(description.sdpFmtpLine || [])])]
			return {
				...x,
				...(feedbackSupport.length ? { feedbackSupport } : {}),
				...(sdpFmtpLine.length ? { sdpFmtpLine } : {}),
				clockRates: [...new Set([...(x.clockRates || []), ...(description.clockRates || [])])],
			}
		})
		if (didMerge) {
			return mergerAcc
		}
		return [...descriptionAcc, description]
	}, [])
}

export const getCapabilities = (sdp: string) => {
	const videoDescriptors = ((/m=video [^\s]+ [^\s]+ ([^\n|\r]+)/.exec(sdp) || [])[1] || '').split(' ')
	const audioDescriptors = ((/m=audio [^\s]+ [^\s]+ ([^\n|\r]+)/.exec(sdp) || [])[1] || '').split(' ')
	const rtxCounter = createCounter()
	return {
		audio: constructDescriptions({
			mediaType: 'audio',
			sdp,
			sdpDescriptors: audioDescriptors,
			rtxCounter,
		}),
		video: constructDescriptions({
			mediaType: 'video',
			sdp,
			sdpDescriptors: videoDescriptors,
			rtxCounter,
		}),
	}
}

const getIPAddress = (sdp?: string): string | undefined => {
	const sdpText = sdp ?? ''
	const blocked = '0.0.0.0'
	const candidateEncoding = /((udp|tcp)\s)((\d|\w)+\s)((\d|\w|(\.|:))+)(?=\s)/gi
	const connectionLineEncoding = /(c=IN\s)(.+)\s/gi
	const connectionLineIpAddress = ((sdpText.match(connectionLineEncoding) || [])[0] || '').trim().split(' ')[2]
	if (connectionLineIpAddress && connectionLineIpAddress != blocked) {
		return connectionLineIpAddress
	}
	const candidateIpAddress = ((sdpText.match(candidateEncoding) || [])[0] || '').split(' ')[2]
	return candidateIpAddress && candidateIpAddress != blocked ? candidateIpAddress : undefined
}

export default async function getWebRTCData(signal?: AbortSignal): Promise<Record<string, unknown> | null> {
	if (!window.RTCPeerConnection) return null
	if (signal?.aborted) {
		throw signal.reason ?? new DOMException('WebRTC detection was aborted.', 'AbortError')
	}

	return new Promise<Record<string, unknown> | null>((resolve, reject) => {
		const config: RTCConfiguration = {
			iceCandidatePoolSize: 1,
			iceServers: [
				{
					urls: ['stun:stun4.l.google.com:19302', 'stun:stun3.l.google.com:19302'],
				},
			],
		}
		const connection = new RTCPeerConnection(config)
		let giveUpOnIPAddress: ReturnType<typeof setTimeout> | undefined
		let settled = false
		let iceCandidate = ''
		let foundation = ''
		let sdp: string | undefined
		let extensions: string[] | undefined
		let codecsSdp: ReturnType<typeof getCapabilities> | undefined

		const cleanup = () => {
			clearTimeout(giveUpOnIPAddress)
			signal?.removeEventListener('abort', abort)
			try {
				connection.removeEventListener('icecandidate', computeCandidate)
			} catch {}
			try {
				connection.close()
			} catch {}
		}
		const finish = (
			value: Record<string, unknown> | null | undefined,
			error?: unknown,
			rejected: boolean = false,
		) => {
			if (settled) return
			settled = true
			cleanup()
			if (rejected) {
				reject(error)
				return
			}
			resolve(value ?? null)
		}
		const abort = () =>
			finish(undefined, signal?.reason ?? new DOMException('WebRTC detection was aborted.', 'AbortError'), true)
		const computeCandidate = (event: RTCPeerConnectionIceEvent) => {
			const { candidate, foundation: foundationProp } = event.candidate || {}
			if (!candidate) return
			if (!iceCandidate) {
				iceCandidate = candidate
				foundation = (/^candidate:([\w]+)/.exec(candidate) || [])[1] || ''
			}
			const address = getIPAddress(connection.localDescription?.sdp)
			if (!address) return
			const knownInterface: Record<string, string> = {
				842163049: 'public interface',
				2268587630: 'WireGuard',
			}
			return finish({
				codecsSdp,
				extensions,
				foundation: knownInterface[foundation] || foundation,
				foundationProp,
				iceCandidate,
				address,
				stunConnection: candidate,
			})
		}

		signal?.addEventListener('abort', abort, { once: true })
		if (signal?.aborted) {
			abort()
			return
		}
		try {
			connection.addEventListener('icecandidate', computeCandidate)
			connection.createDataChannel('')
			giveUpOnIPAddress = setTimeout(
				() =>
					finish(
						sdp
							? {
									codecsSdp,
									extensions,
									foundation,
									iceCandidate,
								}
							: null,
					),
				3000,
			)
		} catch (error) {
			finish(undefined, error, true)
			return
		}
		void (async () => {
			try {
				const offer = await connection.createOffer({
					offerToReceiveAudio: true,
					offerToReceiveVideo: true,
				})
				sdp = offer.sdp ?? undefined
				extensions = getExtensions(sdp)
				codecsSdp = getCapabilities(sdp ?? '')
				await connection.setLocalDescription(offer)
			} catch (error) {
				finish(undefined, error, true)
			}
		})()
	})
}
