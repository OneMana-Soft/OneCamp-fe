// Vitest setup. Imports the jest-dom matcher extensions so tests can
// assert on DOM state with `.toBeInTheDocument()`, `.toHaveTextContent()`
// and friends without re-importing them per file.
import "@testing-library/jest-dom/vitest"

// jsdom has no ResizeObserver, and Radix's checkbox, select and popover
// measure themselves with one. A no-op stands in, so a test can render them.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
}

// jsdom lays nothing out, so it has no scrollIntoView. Lists call it to keep
// the keyboard's place in view, and cmdk to keep the picked option in view.
if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() {}
}

// jsdom's Blob (and so File) has no text(); browsers have had it since 2019.
// Reading a chosen file goes through it.
if (typeof Blob !== "undefined" && !Blob.prototype.text) {
  Blob.prototype.text = function text(this: Blob) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(reader.error)
      reader.readAsText(this)
    })
  }
}
