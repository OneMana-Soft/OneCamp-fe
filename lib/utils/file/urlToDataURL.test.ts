import { afterEach, describe, expect, it, vi } from "vitest"
import { urlToDataURL } from "./urlToDataURL"

afterEach(() => vi.unstubAllGlobals())

describe("a file's address read as a data URL", () => {
  it("reads the file's bytes (lib/http/fetchFile) into a data URL", async () => {
    // The page's own Blob, as a browser's answer gives (jsdom's FileReader reads only its own).
    const fetcher = vi.fn(async () => ({ ok: true, blob: async () => new Blob(["hi"], { type: "text/plain" }) }))
    vi.stubGlobal("fetch", fetcher)
    expect(await urlToDataURL("/templates/note.png")).toBe("data:text/plain;base64,aGk=")
    expect(fetcher).toHaveBeenCalledWith("/templates/note.png")
  })

  it("is nothing for an answer that isn't the file (a 404 page is no picture), or no answer", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>Not found</html>", { status: 404 })))
    expect(await urlToDataURL("/gone")).toBeNull()
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("offline"))))
    expect(await urlToDataURL("/offline")).toBeNull()
  })

  it("passes a data URL through unread", async () => {
    const fetcher = vi.fn()
    vi.stubGlobal("fetch", fetcher)
    expect(await urlToDataURL("data:image/png;base64,AAAA")).toBe("data:image/png;base64,AAAA")
    expect(fetcher).not.toHaveBeenCalled()
  })
})
