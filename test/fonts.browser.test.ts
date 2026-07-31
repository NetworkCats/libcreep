import { describe, expect, it, vi } from 'vitest';

describe('font detector DOM isolation', () => {
  it('does not replace or remove host elements with legacy fixture names', async () => {
    const frame = document.createElement('iframe');
    const loaded = new Promise<void>((resolve) => {
      frame.addEventListener('load', () => resolve(), { once: true });
    });
    frame.src = 'about:blank';
    document.body.appendChild(frame);
    await loaded;
    const frameWindow = frame.contentWindow;
    const frameDocument = frame.contentDocument;
    if (!frameWindow || !frameDocument?.body) {
      frame.remove();
      throw new Error('Test iframe is unavailable.');
    }

    const fingerprintHost = frameDocument.createElement('div');
    fingerprintHost.id = 'font-fingerprint';
    fingerprintHost.textContent = 'host fingerprint node';
    const containerHost = frameDocument.createElement('div');
    containerHost.id = 'pixel-emoji-container';
    containerHost.textContent = 'host container node';
    const classHost = frameDocument.createElement('div');
    classHost.className = 'pixel-emoji';
    classHost.setAttribute('style', 'font-size: 17px');
    classHost.textContent = 'host class node';
    frameDocument.body.append(fingerprintHost, containerHost, classHost);
    const originalMarkup = [fingerprintHost, containerHost, classHost].map(
      (element) => element.outerHTML,
    );

    try {
      const importInFrame = (
        frameWindow as unknown as typeof globalThis & {
          eval(source: string): unknown;
        }
      ).eval('(url) => import(url)') as (url: string) => Promise<unknown>;
      const { default: getFonts } = (await importInFrame(
        '/src/internal/fonts/index.ts',
      )) as { default(): Promise<unknown> };

      await expect(getFonts()).resolves.toBeTypeOf('object');
      expect(
        [fingerprintHost, containerHost, classHost].map(
          (element) => element.isConnected,
        ),
      ).toEqual([true, true, true]);
      expect(
        [fingerprintHost, containerHost, classHost].map(
          (element) => element.outerHTML,
        ),
      ).toEqual(originalMarkup);
    } finally {
      frame.remove();
    }
  });

  it('measures styles through the mounted document realm', async () => {
    const frame = document.createElement('iframe');
    const loaded = new Promise<void>((resolve) => {
      frame.addEventListener('load', () => resolve(), { once: true });
    });
    frame.src = 'about:blank';
    document.body.appendChild(frame);
    await loaded;
    const frameWindow = frame.contentWindow;
    const frameDocument = frame.contentDocument;
    if (!frameWindow || !frameDocument?.body) {
      frame.remove();
      throw new Error('Test iframe is unavailable.');
    }

    const importInFrame = (
      frameWindow as unknown as typeof globalThis & {
        eval(source: string): unknown;
      }
    ).eval('(url) => import(url)') as (url: string) => Promise<unknown>;
    const lies = (await importInFrame('/src/internal/lies/index.ts')) as {
      readonly PHANTOM_DARKNESS: Window;
      initializePrototypeLies(): number;
      removePhantom(): void;
      renewPhantom(): void;
    };

    try {
      lies.renewPhantom();
      lies.initializePrototypeLies();
      const phantomGetComputedStyle = vi.spyOn(
        lies.PHANTOM_DARKNESS,
        'getComputedStyle',
      );
      const { default: getFonts } = (await importInFrame(
        '/src/internal/fonts/index.ts',
      )) as { default(): Promise<unknown> };

      await expect(getFonts()).resolves.toBeTypeOf('object');
      expect(phantomGetComputedStyle).toHaveBeenCalled();
    } finally {
      lies.removePhantom();
      frame.remove();
    }
  });
});
