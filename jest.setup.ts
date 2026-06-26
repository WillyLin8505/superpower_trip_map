import '@testing-library/jest-dom'

// jsdom does not implement scrollIntoView; guard for non-jsdom (node) environments
if (typeof window !== 'undefined') {
  window.HTMLElement.prototype.scrollIntoView = jest.fn()
}
