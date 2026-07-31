import { PlatformClassifier, type PlatformClassifier as Platform } from './types'

export function isFontOSBad(userAgentOS: Platform | undefined, fonts: readonly string[] | undefined): boolean {
	if (!userAgentOS || !fonts || !fonts.length) return false

	const fontSet = new Set(fonts)

	const isLikeWindows = (
		fontSet.has('Cambria Math') ||
		fontSet.has('Nirmala UI') ||
		fontSet.has('Leelawadee UI') ||
		fontSet.has('HoloLens MDL2 Assets') ||
		fontSet.has('Segoe Fluent Icons')
	)

	const isLikeApple = (
		fontSet.has('Helvetica Neue') ||
		fontSet.has('Luminari') ||
		fontSet.has('PingFang HK Light') ||
		fontSet.has('InaiMathi Bold') ||
		fontSet.has('Galvji') ||
		fontSet.has('Chakra Petch')
	)

	const isLikeLinux = (
		fontSet.has('Arimo') ||
		fontSet.has('MONO') ||
		fontSet.has('Ubuntu') ||
		fontSet.has('Noto Color Emoji') ||
		fontSet.has('Dancing Script') ||
		fontSet.has('Droid Sans Mono')
	)

	if (isLikeWindows && userAgentOS != PlatformClassifier.WINDOWS) {
		return true
	} else if (isLikeApple && userAgentOS != PlatformClassifier.APPLE) {
		return true
	} else if (isLikeLinux && userAgentOS != PlatformClassifier.LINUX) {
		return true
	}
	return false
}
