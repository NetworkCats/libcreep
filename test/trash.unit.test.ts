import { beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
});

describe('detector trash utilities', () => {
  it('tests every adjacent pair when detecting gibberish', async () => {
    const { gibberish } = await import('../src/internal/trash/index.js');

    expect(gibberish('jvjv', { strict: true })).toEqual(['jv', 'vj', 'jv']);
    expect(gibberish('jvjv', { strict: true })).toEqual(['jv', 'vj', 'jv']);
  });

  it('does not expose its mutable internal trash array', async () => {
    const { getTrash, sendToTrash } =
      await import('../src/internal/trash/index.js');
    sendToTrash('probe', 'suspicious value');
    getTrash().trashBin.length = 0;

    expect(getTrash().trashBin).toEqual([
      { name: 'probe', value: 'suspicious value' },
    ]);
  });

  it('handles non-string renderer values without throwing', async () => {
    const { getWebGLRendererConfidence } =
      await import('../src/internal/trash/index.js');
    const hostile = {
      toString() {
        throw new Error('blocked renderer conversion');
      },
    };

    expect(() => getWebGLRendererConfidence(hostile)).not.toThrow();
    expect(getWebGLRendererConfidence(hostile)).toBeUndefined();
  });
});
