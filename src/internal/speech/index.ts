// @ts-nocheck
import { captureError } from '../errors'
import { lieProps } from '../lies'

import { createTimer, queueEvent, logTestResult, IS_BLINK, Analysis, LowerEntropy } from '../utils/helpers'
export default async function getVoices() {
	// Don't run voice immediately. This is unstable
	// wait a bit for services to load
	await new Promise((resolve) => setTimeout(() => resolve(undefined), 50))
	const synthesis = window.speechSynthesis
	return new Promise(async (resolve) => {
		let settled = false
		let giveUpOnVoices
		let getVoices
		const finish = (value) => {
			if (settled) return
			settled = true
			clearTimeout(giveUpOnVoices)
			if (getVoices && synthesis?.removeEventListener) {
				synthesis.removeEventListener('voiceschanged', getVoices)
			} else if (synthesis?.onvoiceschanged == getVoices) {
				synthesis.onvoiceschanged = null
			}
			resolve(value)
		}
		try {
			const timer = createTimer()
			await queueEvent(timer)

			// use window since iframe is unstable in FF
			const supported = typeof synthesis?.getVoices == 'function'
			supported && synthesis.getVoices() // warm up
			if (!supported) {
				logTestResult({ test: 'speech', passed: false })
				return finish(null)
			}

			const voicesLie = !!lieProps['SpeechSynthesis.getVoices']

			giveUpOnVoices = setTimeout(() => {
				logTestResult({ test: 'speech', passed: false })
				return finish(null)
			}, 300)

			getVoices = () => {
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
				const local = dataUnique.filter((x) => x.localService).map((x) => x.name)
				const remote = dataUnique.filter((x) => !x.localService).map((x) => x.name)
				const languages = [...new Set(dataUnique.map((x) => x.lang))]
				const defaultLocalVoices = dataUnique.filter((x) => x.default && x.localService)

				let defaultVoiceName = ''
				let defaultVoiceLang = ''
				if (defaultLocalVoices.length === 1) {
					const { name, lang } = defaultLocalVoices[0]
					defaultVoiceName = name
					defaultVoiceLang = (lang || '').replace(/_/, '-')
				}

				// eslint-disable-next-line new-cap
				const { locale: localeLang } = Intl.DateTimeFormat().resolvedOptions()
				if (defaultVoiceLang &&
					defaultVoiceLang.split('-')[0] !== localeLang.split('-')[0]) {
					// this is not trash
					Analysis.voiceLangMismatch = true
					LowerEntropy.TIME_ZONE = true
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
			}

			getVoices()
			if (settled) return
			if (synthesis.addEventListener) {
				return synthesis.addEventListener('voiceschanged', getVoices)
			}
			synthesis.onvoiceschanged = getVoices
		} catch (error) {
			logTestResult({ test: 'speech', passed: false })
			captureError(error)
			return finish(null)
		}
	})
}
