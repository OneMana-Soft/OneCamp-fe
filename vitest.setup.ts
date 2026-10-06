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
