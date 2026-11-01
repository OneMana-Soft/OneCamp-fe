import { afterEach, describe, expect, it, vi } from "vitest"
import { copyLook, LOOK_WAIT_MS, openOnLeave, pipKind } from "./pipWindow"

const asWindow = (extra: object, pictureInPictureEnabled: boolean) => ({ ...extra, document: { pictureInPictureEnabled } }) as unknown as Window

describe("pipKind (meet-14: picture-in-picture from the dock)", () => {
  it("is a window of our own where the browser has Document Picture-in-Picture", () => {
    expect(pipKind(asWindow({ documentPictureInPicture: { requestWindow: async () => window } }, true))).toBe("document")
  })

  it("falls back to a video's own picture-in-picture where only that exists (Safari)", () => {
    expect(pipKind(asWindow({}, true))).toBe("video")
  })

  it("is none where the browser has neither, and outside a browser", () => {
    expect(pipKind(asWindow({}, false))).toBeNull()
    expect(pipKind(undefined)).toBeNull()
  })
})

describe("copyLook", () => {
  const from = document
  let stop: (() => void) | undefined
  afterEach(() => {
    stop?.()
    from.head.querySelectorAll("[data-test-look]").forEach((el) => el.remove())
    for (const a of ["class", "style", "data-theme"]) from.documentElement.removeAttribute(a)
    from.body.removeAttribute("class")
  })

  const app = () => {
    from.head.insertAdjacentHTML("beforeend", '<link data-test-look rel="stylesheet" href="/_next/static/css/app.css"><style data-test-look>.tile{color:red}</style><link data-test-look rel="icon" href="/favicon.ico">')
    from.documentElement.className = "dark"
    from.documentElement.setAttribute("data-theme", "dark")
    from.documentElement.setAttribute("style", "color-scheme: dark")
    from.body.className = "font-sans antialiased"
  }

  /** A stylesheet link of the app's: its sheet as the browser gives it, or a sheet whose rules it won't show (another origin's). */
  const sheetLink = (href: string, rules: string[] | "unreadable") => {
    from.head.insertAdjacentHTML("beforeend", `<link data-test-look rel="stylesheet" href="${href}">`)
    const link = from.head.lastElementChild as HTMLLinkElement
    const cssRules = () => {
      if (rules === "unreadable") throw new DOMException("another origin's", "SecurityError")
      return rules.map((cssText) => ({ cssText }))
    }
    Object.defineProperty(link, "sheet", { configurable: true, value: { href: link.href, get cssRules() { return cssRules() } } })
  }
  /** copyLook's answer, read without trusting its shape. */
  const look = (to: Document) => copyLook(from, to) as Partial<ReturnType<typeof copyLook>>

  it("gives the window the app's stylesheets, by their full address, and its theme and fonts", () => {
    app()
    const to = document.implementation.createHTMLDocument("pip")
    stop = copyLook(from, to).stop
    const links = Array.from(to.head.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')).map((l) => l.getAttribute("href"))
    expect(links).toEqual([new URL("/_next/static/css/app.css", from.baseURI).href])
    expect(Array.from(to.head.querySelectorAll("style")).map((s) => s.textContent)).toContain(".tile{color:red}")
    expect(to.head.querySelector('link[rel="icon"]')).toBeNull()
    expect(to.documentElement.className).toBe("dark")
    expect(to.documentElement.getAttribute("data-theme")).toBe("dark")
    expect(to.documentElement.getAttribute("style")).toBe("color-scheme: dark")
    expect(to.body.className).toBe("font-sans antialiased")
  })

  it("keeps the window's theme in step with the app's while it's open, and stops when told", async () => {
    app()
    const to = document.implementation.createHTMLDocument("pip")
    stop = copyLook(from, to).stop
    from.documentElement.className = "light"
    from.documentElement.removeAttribute("data-theme")
    await Promise.resolve()
    expect(to.documentElement.className).toBe("light")
    expect(to.documentElement.hasAttribute("data-theme")).toBe(false)
    stop()
    from.documentElement.className = "dark"
    await Promise.resolve()
    expect(to.documentElement.className).toBe("light")
  })

  it("draws a loaded sheet into the window as its rules, so the window is dressed from its first frame, with every address made full", () => {
    sheetLink("/_next/static/chunks/app.css", ['@font-face { font-family: Inter; src: url("../media/inter.woff2") format("woff2"); }', ".cut { mask: url(#cut); background: url(data:image/png;base64,AA); }"])
    const to = document.implementation.createHTMLDocument("pip")
    const got = look(to)
    stop = got.stop
    expect(to.head.querySelector('link[rel="stylesheet"]'), "no sheet left to load").toBeNull()
    const css = Array.from(to.head.querySelectorAll("style"), (s) => s.textContent).join("\n")
    // The font's address is the sheet's own, not the window's (about:blank).
    expect(css).toContain(`url("${new URL("/_next/static/media/inter.woff2", from.baseURI).href}")`)
    expect(css, "an address inside the document stays").toContain("url(#cut)")
    expect(css, "data stays").toContain("url(data:image/png;base64,AA)")
  })

  it("links a sheet it can't read, and is ready once that sheet loads or fails", async () => {
    sheetLink("https://cdn.example/x.css", "unreadable")
    sheetLink("https://cdn.example/y.css", "unreadable")
    const to = document.implementation.createHTMLDocument("pip")
    const got = look(to)
    stop = got.stop
    expect(got.ready, "the window says when it's dressed").toBeInstanceOf(Promise)
    let ready = false
    void got.ready!.then(() => (ready = true))
    const [x, y] = Array.from(to.head.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'))
    expect([x?.href, y?.href]).toEqual(["https://cdn.example/x.css", "https://cdn.example/y.css"])
    x.dispatchEvent(new Event("load"))
    await Promise.resolve()
    expect(ready, "not while a sheet still loads").toBe(false)
    y.dispatchEvent(new Event("error"))
    await vi.waitFor(() => expect(ready).toBe(true))
  })

  it("is ready once the wait is up, when a sheet never answers: the call matters more than its dress", async () => {
    vi.useFakeTimers()
    try {
      sheetLink("https://cdn.example/x.css", "unreadable")
      const got = look(document.implementation.createHTMLDocument("pip"))
      stop = got.stop
      expect(got.ready, "the window says when it's dressed").toBeInstanceOf(Promise)
      let ready = false
      void got.ready!.then(() => (ready = true))
      await vi.advanceTimersByTimeAsync(LOOK_WAIT_MS - 1)
      expect(ready).toBe(false)
      await vi.advanceTimersByTimeAsync(1)
      expect(ready).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe("openOnLeave (Chrome opens picture-in-picture by itself when you leave the tab mid-call, as Meet's)", () => {
  it("hands the browser what to open, and the stop takes it back", () => {
    const setActionHandler = vi.fn()
    const open = () => {}
    const stop = openOnLeave(open, { setActionHandler } as unknown as MediaSession)
    expect(setActionHandler).toHaveBeenCalledWith("enterpictureinpicture", open)
    stop()
    expect(setActionHandler).toHaveBeenLastCalledWith("enterpictureinpicture", null)
  })

  it("says nothing where the browser doesn't know the action", () => {
    const setActionHandler = vi.fn(() => {
      throw new TypeError("not a MediaSessionAction")
    })
    expect(() => openOnLeave(() => {}, { setActionHandler } as unknown as MediaSession)()).not.toThrow()
    expect(() => openOnLeave(() => {}, undefined)()).not.toThrow()
  })
})
