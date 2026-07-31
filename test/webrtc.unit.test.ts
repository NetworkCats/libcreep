import { afterEach, describe, expect, it, vi } from 'vitest';

import getWebRTCData, {
  getCapabilities,
  getMediaCapabilities,
  getWebRTCDevices,
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

  it('bounds passive media device enumeration', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('navigator', {
      mediaDevices: {
        enumerateDevices: () => new Promise<never>(() => undefined),
      },
    });

    const result = getWebRTCDevices();
    const rejection = expect(result).rejects.toMatchObject({
      name: 'TimeoutError',
    });
    await vi.advanceTimersByTimeAsync(3_000);

    await rejection;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('bounds passive media capability probes', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('navigator', {
      mediaCapabilities: {
        decodingInfo: () => new Promise<never>(() => undefined),
      },
    });

    const result = getMediaCapabilities();
    await vi.advanceTimersByTimeAsync(3_000);

    await expect(result).resolves.toEqual({});
    expect(vi.getTimerCount()).toBe(0);
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

  it('still settles when peer-connection cleanup throws', async () => {
    vi.useFakeTimers();

    class ThrowingClosePeerConnection {
      addEventListener(): void {}
      close(): void {
        throw new Error('close blocked');
      }
      createDataChannel(): void {}
      createOffer(): Promise<RTCSessionDescriptionInit> {
        return new Promise(() => undefined);
      }
      removeEventListener(): void {
        throw new Error('listener cleanup blocked');
      }
    }

    vi.stubGlobal('window', {
      RTCPeerConnection: ThrowingClosePeerConnection,
    });
    vi.stubGlobal('RTCPeerConnection', ThrowingClosePeerConnection);

    const result = getWebRTCData();
    await vi.advanceTimersByTimeAsync(3_000);

    await expect(result).resolves.toBeNull();
  });

  it('preserves falsy abort reasons and closes the connection', async () => {
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
    const controller = new AbortController();
    const result = getWebRTCData(controller.signal);
    controller.abort(0);

    await expect(result).rejects.toBe(0);
    expect(close).toHaveBeenCalledOnce();
  });

  it('observes an abort triggered reentrantly by peer construction', async () => {
    const controller = new AbortController();
    const close = vi.fn();

    class AbortingPeerConnection {
      constructor() {
        controller.abort(false);
      }
      addEventListener(): void {}
      close = close;
      createDataChannel(): void {}
      createOffer(): Promise<RTCSessionDescriptionInit> {
        return new Promise(() => undefined);
      }
      removeEventListener(): void {}
    }

    vi.stubGlobal('window', { RTCPeerConnection: AbortingPeerConnection });
    vi.stubGlobal('RTCPeerConnection', AbortingPeerConnection);

    await expect(getWebRTCData(controller.signal)).rejects.toBe(false);
    expect(close).toHaveBeenCalledOnce();
  });
});
