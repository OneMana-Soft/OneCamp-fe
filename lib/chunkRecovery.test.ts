import { afterEach, describe, expect, it, vi } from "vitest"
import { CHUNK_RECOVERY_SCRIPT, isChunkLoadError } from "./chunkRecovery"

describe("chunk recovery", () => {
  it.each([
    { name: "ChunkLoadError", message: "Loading chunk 735 failed." },
    new Error("Failed to load chunk /_next/static/chunks/c74c6019fac0e2df.js from module 735393"),
    new Error("Loading CSS chunk 12 failed"),
  ])("recognises %o", (e) => expect(isChunkLoadError(e)).toBe(true))
  it("leaves other errors alone", () => {
    expect(isChunkLoadError(new Error("Cannot read properties of undefined"))).toBe(false)
    expect(isChunkLoadError(null)).toBe(false)
  })
  it("ships a script that parses", () => expect(() => new Function(CHUNK_RECOVERY_SCRIPT)).not.toThrow())

  describe("the early script", () => {
    const reload = vi.fn()
    const fail = (el: HTMLElement) => {
      document.head.appendChild(el)
      el.dispatchEvent(new Event("error"))
    }
    afterEach(() => {
      reload.mockReset()
      sessionStorage.clear()
      document.head.innerHTML = ""
    })

    it("reloads once when the app's code or stylesheet fails to load, not for a font", () => {
      vi.stubGlobal("location", { reload })
      new Function(CHUNK_RECOVERY_SCRIPT)()
      const font = Object.assign(document.createElement("link"), { rel: "preload", href: "/_next/static/media/a.woff2" })
      fail(font)
      expect(reload).not.toHaveBeenCalled()
      const css = Object.assign(document.createElement("link"), { rel: "stylesheet", href: "/_next/static/chunks/a.css" })
      fail(css)
      expect(reload).toHaveBeenCalledTimes(1)
      const js = Object.assign(document.createElement("script"), { src: "/_next/static/chunks/b.js" })
      fail(js)
      expect(reload).toHaveBeenCalledTimes(1)
      vi.unstubAllGlobals()
    })
  })
})
