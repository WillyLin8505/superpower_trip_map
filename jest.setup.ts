import '@testing-library/jest-dom'

// jsdom does not implement scrollIntoView; guard for non-jsdom (node) environments
if (typeof window !== 'undefined') {
  window.HTMLElement.prototype.scrollIntoView = jest.fn()
}

// jsdom 26 does not ship PointerEvent; polyfill so fireEvent.pointer* tests work
if (typeof window !== 'undefined' && typeof window.PointerEvent === 'undefined') {
  class PointerEvent extends MouseEvent {
    readonly pointerId: number
    constructor(type: string, init: PointerEventInit & MouseEventInit = {}) {
      super(type, init)
      this.pointerId = init.pointerId ?? 0
    }
  }
  Object.defineProperty(window, 'PointerEvent', {
    value: PointerEvent,
    writable: true,
    configurable: true,
  })
}
