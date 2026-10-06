import '@testing-library/jest-dom';

/**
 * jsdom does not implement PointerEvent. Without a constructor to use,
 * `fireEvent.pointerDown` and friends fall back to a plain Event, and the
 * coordinate properties are dropped because they are not part of that
 * interface — the handler fires with `clientX` and `clientY` undefined.
 *
 * That failure mode is quiet rather than loud. Code doing geometry on those
 * values produces NaN, and `NaN` flowing into a style string yields something
 * like `width: NaN%`, which jsdom rejects as invalid CSS while keeping the
 * previous value. The result is a test that reports a plausible wrong number
 * instead of an error, which reads like a bug in the component under test.
 *
 * MouseEvent already carries the coordinate properties, so extending it and
 * adding `pointerId` is enough for pointer interactions to behave in tests the
 * way they do in a browser.
 */
class PointerEventPolyfill extends MouseEvent {
  readonly pointerId: number;
  readonly pointerType: string;
  readonly isPrimary: boolean;

  constructor(type: string, params: PointerEventInit = {}) {
    super(type, params);
    this.pointerId = params.pointerId ?? 0;
    this.pointerType = params.pointerType ?? 'mouse';
    this.isPrimary = params.isPrimary ?? true;
  }
}

if (typeof globalThis.PointerEvent === 'undefined') {
  globalThis.PointerEvent = PointerEventPolyfill as unknown as typeof PointerEvent;
}

// jsdom likewise omits the pointer capture methods; they are no-ops in tests
// but components call them during drag interactions.
if (typeof Element.prototype.setPointerCapture === 'undefined') {
  Element.prototype.setPointerCapture = function setPointerCapture() {};
  Element.prototype.releasePointerCapture = function releasePointerCapture() {};
  Element.prototype.hasPointerCapture = function hasPointerCapture() {
    return false;
  };
}
