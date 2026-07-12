import { afterEach, describe, expect, it, vi } from 'vitest';

import getWebRTCData, {
  getCapabilities,
} from '../src/internal/webrtc/index.js';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('WebRTC helpers', () => {
  it('merges non-adjacent descriptions of the same codec', () => {
    const capabilities = getCapabilities(`
m=audio 9 UDP/TLS/RTP/SAVPF 111 0 112
a=rtpmap:111 opus/48000/2
a=rtpmap:0 PCMU/8000
a=rtpmap:112 opus/16000/1
`);

    expect(capabilities.audio).toEqual([
      {
        channels: 2,
        clockRates: [48_000, 16_000],
        mimeType: 'audio/opus',
      },
      {
        channels: 1,
        clockRates: [8_000],
        mimeType: 'audio/PCMU',
      },
    ]);
  });

  it('settles when offer creation never completes', async () => {
    vi.useFakeTimers();
    const close = vi.fn();

    class HangingPeerConnection {
      addEventListener(): void {}
      close = close;
      createDataChannel(): void {}
      createOffer(): Promise<RTCSessionDescriptionInit> {
        return new Promise(() => undefined);
      }
      removeEventListener(): void {}
    }

    vi.stubGlobal('window', { RTCPeerConnection: HangingPeerConnection });
    vi.stubGlobal('RTCPeerConnection', HangingPeerConnection);

    const result = getWebRTCData();
    await vi.advanceTimersByTimeAsync(3_000);

    await expect(result).resolves.toBeNull();
    expect(close).toHaveBeenCalledOnce();
  });
});
