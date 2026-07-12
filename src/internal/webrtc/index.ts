// @ts-nocheck

export async function getWebRTCDevices(): Promise<MediaDeviceKind[] | null> {
	if (!navigator?.mediaDevices?.enumerateDevices) return null
	return navigator.mediaDevices.enumerateDevices().then((devices) => {
		return devices.map((device) => device.kind).sort()
	})
}

const getMediaConfig = (codec, video, audio) => ({
	type: 'file',
	video: !/^video/.test(codec) ? undefined : {
		contentType: codec,
		...video,
	},
	audio: !/^audio/.test(codec) ? undefined : {
		contentType: codec,
		...audio,
	},
})

export const getMediaCapabilities = async () => {
	const video = {
		width: 1920,
		height: 1080,
		bitrate: 120000,
		framerate: 60,
	}

	const audio = {
		channels: 2,
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
		// @ts-ignore
		return navigator.mediaCapabilities.decodingInfo(config).then((support) => ({
			codec,
			...support,
		}))
		.catch(() => undefined)
	})

	const capabilities = await Promise.all(decodingInfo).then((data) => {
		return data.reduce((acc, support) => {
			const { codec, supported, smooth, powerEfficient } = support || {}
			if (!supported) return acc
			return {
				...acc,
				[''+codec]: [
					...(smooth ? ['smooth'] : []),
					...(powerEfficient ? ['efficient'] : []),
				],
			}
		}, {})
	}).catch(() => undefined)

	return capabilities
}

const getExtensions = (sdp) => {
	const extensions = (('' + sdp).match(/extmap:\d+ [^\n|\r]+/g) || [])
		.map((x) => x.replace(/extmap:[^\s]+ /, ''))
	return [...new Set(extensions)].sort()
}

const createCounter = () => {
	let counter = 0
	return {
		increment: () => counter += 1,
		getValue: () => counter,
	}
}

// https://webrtchacks.com/sdp-anatomy/
// https://tools.ietf.org/id/draft-ietf-rtcweb-sdp-08.html
const constructDescriptions = ({mediaType, sdp, sdpDescriptors, rtxCounter}) => {
	if (!(''+sdpDescriptors)) {
		return
	}
	return sdpDescriptors.reduce((descriptionAcc, descriptor) => {
		const matcher = `(rtpmap|fmtp|rtcp-fb):${descriptor} (.+)`
		const formats = (sdp.match(new RegExp(matcher, 'g')) || [])
		if (!(''+formats)) {
			return descriptionAcc
		}
		const isRtxCodec = ('' + formats).includes(' rtx/')
		if (isRtxCodec) {
			if (rtxCounter.getValue()) {
				return descriptionAcc
			}
			rtxCounter.increment()
		}
		const getLineData = (x) => x.replace(/[^\s]+ /, '')
		const description = formats.reduce((acc, x) => {
			const rawData = getLineData(x)
			const data = rawData.split('/')
			const codec = data[0]
			const description = {}

			if (x.includes('rtpmap')) {
				if (mediaType == 'audio') {
					description.channels = (+data[2]) || 1
				}
				description.mimeType = `${mediaType}/${codec}`
				description.clockRates = [+data[1]]
				return {
					...acc,
					...description,
				}
			} else if (x.includes('rtcp-fb')) {
				return {
					...acc,
					feedbackSupport: [...(acc.feedbackSupport||[]), rawData],
				}
			} else if (isRtxCodec) {
				return acc // no sdpFmtpLine
			}
			return { ...acc, sdpFmtpLine: [...rawData.split(';')] }
		}, {})

		let shouldMerge = false
		const mergerAcc = descriptionAcc.map((x) => {
			shouldMerge = x.mimeType == description.mimeType
			if (shouldMerge) {
				if (x.feedbackSupport) {
					x.feedbackSupport = [
						...new Set([...x.feedbackSupport, ...description.feedbackSupport]),
					]
				}
				if (x.sdpFmtpLine) {
					x.sdpFmtpLine = [
						...new Set([...x.sdpFmtpLine, ...description.sdpFmtpLine]),
					]
				}
				return {
					...x,
					clockRates: [
						...new Set([...x.clockRates, ...description.clockRates]),
					],
				}
			}
			return x
		})
		if (shouldMerge) {
			return mergerAcc
		}
		return [...descriptionAcc, description]
	}, [])
}

const getCapabilities = (sdp) => {
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

const getIPAddress = (sdp) => {
	const blocked = '0.0.0.0'
	const candidateEncoding = /((udp|tcp)\s)((\d|\w)+\s)((\d|\w|(\.|\:))+)(?=\s)/ig
	const connectionLineEncoding = /(c=IN\s)(.+)\s/ig
	const connectionLineIpAddress = ((sdp.match(connectionLineEncoding) || [])[0] || '').trim().split(' ')[2]
	if (connectionLineIpAddress && (connectionLineIpAddress != blocked)) {
		return connectionLineIpAddress
	}
	const candidateIpAddress = ((sdp.match(candidateEncoding) || [])[0] || '').split(' ')[2]
	return candidateIpAddress && (candidateIpAddress != blocked) ? candidateIpAddress : undefined
}

export default async function getWebRTCData(signal?: AbortSignal): Promise<Record<string, unknown> | null> {
	if (!window.RTCPeerConnection) return null
	if (signal?.aborted) {
		throw signal.reason || new DOMException('WebRTC detection was aborted.', 'AbortError')
	}

	return new Promise((resolve, reject) => {
		const config = {
			iceCandidatePoolSize: 1,
			iceServers: [{
				urls: [
					'stun:stun4.l.google.com:19302',
					'stun:stun3.l.google.com:19302',
				],
			}],
		}
		const connection = new RTCPeerConnection(config)
		let giveUpOnIPAddress
		let settled = false
		let iceCandidate = ''
		let foundation = ''
		let sdp
		let extensions
		let codecsSdp

		const cleanup = () => {
			clearTimeout(giveUpOnIPAddress)
			signal?.removeEventListener('abort', abort)
			connection.removeEventListener('icecandidate', computeCandidate)
			connection.close()
		}
		const finish = (value, error) => {
			if (settled) return
			settled = true
			cleanup()
			return error ? reject(error) : resolve(value)
		}
		const abort = () => finish(undefined, signal.reason || new DOMException('WebRTC detection was aborted.', 'AbortError'))
		const computeCandidate = (event) => {
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
		connection.addEventListener('icecandidate', computeCandidate)
		connection.createDataChannel('')
		void (async () => {
			try {
				const offer = await connection.createOffer({
					offerToReceiveAudio: true,
					offerToReceiveVideo: true,
				})
				sdp = offer.sdp
				extensions = getExtensions(sdp)
				codecsSdp = getCapabilities(sdp)
				await connection.setLocalDescription(offer)
				giveUpOnIPAddress = setTimeout(() => finish(sdp ? {
					codecsSdp,
					extensions,
					foundation,
					iceCandidate,
				} : null), 3000)
			} catch (error) {
				finish(undefined, error)
			}
		})()
	})
}
