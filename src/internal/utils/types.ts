export const PlatformClassifier = {
	WINDOWS: 'Windows',
	LINUX: 'Linux',
	APPLE: 'Apple',
	OTHER: 'Other',
} as const

export type PlatformClassifier = typeof PlatformClassifier[keyof typeof PlatformClassifier]
