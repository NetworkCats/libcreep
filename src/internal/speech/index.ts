import { captureError } from '../errors'
import { lieProps } from '../lies'

import { createTimer, queueEvent, logTestResult, IS_BLINK, Analysis, LowerEntropy } from '../utils/helpers'

const getAbortReason = (signal?: AbortSignal) => (
	signal?.reason ?? new DOMException('Speech detection was aborted.', 'AbortError')
)

const throwIfAborted = (signal?: AbortSignal) => {
	if (signal?.aborted) throw getAbortReason(signal)
}

const waitForDelay = (delay: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
	throwIfAborted(signal)
	const timeout = setTimeout(() => {
		signal?.removeEventListener('abort', abort)
		resolve()
	}, delay)
	const abort = () => {
		clearTimeout(timeout)
		signal?.removeEventListener('abort', abort)
		reject(getAbortReason(signal))
	}
	signal?.addEventListener('abort', abort, { once: true })
	if (signal?.aborted) abort()
})

interface SpeechData {
	local: string[]
	remote: string[]
	languages: string[]
	defaultVoiceName: string
	defaultVoiceLang: string
	lied: boolean
}

export default async function getVoices(signal?: AbortSignal): Promise<SpeechData | null> {
	// Don't run voice immediately. This is unstable
	// wait a bit for services to load
	await waitForDelay(50, signal)
	throwIfAborted(signal)
	const synthesis = window.speechSynthesis
	const timer = createTimer()
	await queueEvent(timer)
	throwIfAborted(signal)

	return new Promise<SpeechData | null>((resolve, reject) => {
		let settled = false
		let giveUpOnVoices: ReturnType<typeof setTimeout> | undefined
		let getVoices: (() => void) | undefined
		let previousVoicesChanged: SpeechSynthesis['onvoiceschanged'] | undefined
		let usesPropertyHandler = false
		const finish = (
			value: SpeechData | null | undefined,
			error?: unknown,
			rejected = false,
		) => {
			if (settled) return
			settled = true
			clearTimeout(giveUpOnVoices)
			signal?.removeEventListener('abort', abort)
			try {
				if (getVoices && typeof synthesis?.removeEventListener == 'function') {
					synthesis.removeEventListener('voiceschanged', getVoices)
				} else if (usesPropertyHandler && synthesis?.onvoiceschanged == getVoices) {
					synthesis.onvoiceschanged = previousVoicesChanged ?? null
				}
			} catch {
				// Cleanup failures must not leave the detector promise pending.
			}
			return rejected ? reject(error) : resolve(value ?? null)
		}
		const abort = () => finish(undefined, getAbortReason(signal), true)
		try {
			// use window since iframe is unstable in FF
			const supported = typeof synthesis?.getVoices == 'function'
			if (!supported) {
				logTestResult({ test: 'speech', passed: false })
				return finish(null)
			}
			synthesis.getVoices() // warm up

			const voicesLie = !!lieProps['SpeechSynthesis.getVoices']

			giveUpOnVoices = setTimeout(() => {
				logTestResult({ test: 'speech', passed: false })
				return finish(null)
			}, 300)

			getVoices = () => {
				try {
					throwIfAborted(signal)
					const data = synthesis.getVoices()
					const localServiceDidLoad = (data || []).find((x) => x.localService)
					if (!data || !data.length || (IS_BLINK && !localServiceDidLoad)) {
						return
					}
					// filter first occurrence of unique voiceURI data
					const getUniques = (
						data: SpeechSynthesisVoice[],
						voiceURISet: Set<string>,
					): SpeechSynthesisVoice[] => data
						.filter((x) => {
							const { voiceURI } = x
							if (!voiceURISet.has(voiceURI)) {
								voiceURISet.add(voiceURI)
								return true
							}
							return false
						})

					const dataUnique = getUniques(data, new Set())

					// https://wicg.github.io/speech-api/#speechsynthesisvoice-attributes
					const local = dataUnique.filter((x) => x.localService).map((x) => x.name).sort()
					const remote = dataUnique.filter((x) => !x.localService).map((x) => x.name).sort()
					const languages = [...new Set(dataUnique.map((x) => x.lang))].sort()
					const defaultLocalVoices = dataUnique.filter((x) => x.default && x.localService)

					let defaultVoiceName = ''
					let defaultVoiceLang = ''
					const defaultVoice = defaultLocalVoices[0]
					if (defaultLocalVoices.length === 1 && defaultVoice) {
						const { name, lang } = defaultVoice
						defaultVoiceName = name
						defaultVoiceLang = (lang || '').replace(/_/, '-')
					}

					try {
						// eslint-disable-next-line new-cap
						const { locale: localeLang } = Intl.DateTimeFormat().resolvedOptions()
						if (defaultVoiceLang &&
							defaultVoiceLang.split('-')[0] !== localeLang.split('-')[0]) {
							// this is not trash
							Analysis.voiceLangMismatch = true
							LowerEntropy.TIME_ZONE = true
						}
					} catch (error) {
						captureError(error, 'speech locale comparison failed')
					}

					logTestResult({ time: timer.stop(), test: 'speech', passed: true })
					return finish({
						local,
						remote,
						languages,
						defaultVoiceName,
						defaultVoiceLang,
						lied: voicesLie,
					})
					} catch (error) {
						if (signal?.aborted) return finish(undefined, getAbortReason(signal), true)
						logTestResult({ test: 'speech', passed: false })
						captureError(error)
						return finish(undefined, error, true)
					}
			}

			getVoices()
			if (settled) return
			signal?.addEventListener('abort', abort, { once: true })
			if (signal?.aborted) return abort()
			if (typeof synthesis.addEventListener == 'function') {
				synthesis.addEventListener('voiceschanged', getVoices)
				return
			}
			previousVoicesChanged = synthesis.onvoiceschanged
			usesPropertyHandler = true
			synthesis.onvoiceschanged = getVoices
			} catch (error) {
				if (signal?.aborted) return finish(undefined, getAbortReason(signal), true)
				logTestResult({ test: 'speech', passed: false })
				captureError(error)
				return finish(undefined, error, true)
			}
	})
}
