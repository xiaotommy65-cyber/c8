export function installHeadlessDomShim(): void {
  if (typeof globalThis.document !== 'undefined') return;

  const noop = () => undefined;

  const createNullCtx = (width: number, height: number) => {
    const baseTarget: Record<string, unknown> = {
      fillStyle: '#000000',
      strokeStyle: '#000000',
      lineWidth: 1,
      globalAlpha: 1,
      globalCompositeOperation: 'source-over',
      font: '10px monospace',
      filter: 'none',
      getImageData: (_x: number, _y: number, w = width, h = height) => ({
        width: Math.max(1, Math.round(w)),
        height: Math.max(1, Math.round(h)),
        data: new Uint8ClampedArray(Math.max(1, Math.round(w)) * Math.max(1, Math.round(h)) * 4),
      }),
      createImageData: (w = width, h = height) => ({
        width: Math.max(1, Math.round(w)),
        height: Math.max(1, Math.round(h)),
        data: new Uint8ClampedArray(Math.max(1, Math.round(w)) * Math.max(1, Math.round(h)) * 4),
      }),
      createLinearGradient: () => ({ addColorStop: noop }),
      createRadialGradient: () => ({ addColorStop: noop }),
      measureText: (t: string) => ({ width: String(t).length * 6 }),
    };

    return new Proxy(baseTarget, {
      get(target, prop) {
        if (prop in target) return target[prop as string];
        return noop;
      },
    });
  };

  const createNullCanvas = () => {
    const cvs = {
      width: 72,
      height: 72,
      getContext: () => createNullCtx(cvs.width, cvs.height),
      toDataURL: () => 'data:image/png;base64,',
    };
    return cvs;
  };

  (globalThis as unknown as Record<string, unknown>).document = {
    createElement: (tag: string) => {
      if (tag === 'canvas') return createNullCanvas();
      return {};
    },
  };
}
