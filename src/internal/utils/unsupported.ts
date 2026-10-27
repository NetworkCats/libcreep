import type { UnsupportedReason } from '../../types'

/** @internal Detector return value that marks a known unsupported cause. */
export class Unsupported {
	readonly reason: UnsupportedReason

	constructor(reason: UnsupportedReason) {
		this.reason = reason
	}
}

export const unsupported = (reason: UnsupportedReason): Unsupported => new Unsupported(reason)
