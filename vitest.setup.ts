// Vitest setup. Imports the jest-dom matcher extensions so tests can
// assert on DOM state with `.toBeInTheDocument()`, `.toHaveTextContent()`
// and friends without re-importing them per file.
import "@testing-library/jest-dom/vitest"
import { afterEach, expect } from "vitest"

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

// A test answers its own requests, by mocking the service or hook that makes
// them. One that slipped through went out for real, to whatever was listening
// on localhost: usually nothing, and jsdom printed an AggregateError for each
// (21 a run), but a running dev server would answer it, so a test could pass
// or fail on what else was running. Now such a request fails at once, without
// leaving the process, and the test that made it fails, naming the request.
const reached: string[] = []
const reach = (request: string) => {
  const during = expect.getState().currentTestName
  reached.push(during ? `${request} (during "${during}")` : request)
  return new TypeError(`a test reached the network: ${request}`)
}
if (typeof XMLHttpRequest !== "undefined") {
  const opened = new WeakMap<XMLHttpRequest, string>()
  const open = XMLHttpRequest.prototype.open as (this: XMLHttpRequest, ...args: unknown[]) => void
  XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, ...args: unknown[]) {
    opened.set(this, `${String(args[0]).toUpperCase()} ${String(args[1])}`)
    open.apply(this, args)
  } as typeof XMLHttpRequest.prototype.open
  XMLHttpRequest.prototype.send = function (this: XMLHttpRequest) {
    throw reach(opened.get(this) ?? "a request")
  }
}
globalThis.fetch = (async (input: RequestInfo | URL) => {
  throw reach(`fetch ${input instanceof Request ? input.url : String(input)}`)
}) as typeof fetch

afterEach(() => {
  if (reached.length === 0) return
  const requests = [...new Set(reached.splice(0))].join("; ")
  throw new Error(`The network was reached: ${requests}. Mock what makes the request.`)
})
