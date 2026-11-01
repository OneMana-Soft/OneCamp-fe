import { act, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { usePipWindow } from "./usePipWindow"

/** A stand-in for the browser's Document Picture-in-Picture: each window is an event target with a document, and closing it fires pagehide as the browser's does. */
function fakeDocumentPip() {
  const opened: Window[] = []
  const requestWindow = vi.fn(async () => {
    const target = new EventTarget()
    const win = Object.assign(target, {
      document: document.implementation.createHTMLDocument("pip"),
      close: vi.fn(() => target.dispatchEvent(new Event("pagehide"))),
    }) as unknown as Window
    opened.push(win)
    return win
  })
  Object.defineProperty(window, "documentPictureInPicture", { value: { requestWindow, window: null }, configurable: true })
  return { requestWindow, opened }
}

afterEach(() => {
  delete (window as unknown as { documentPictureInPicture?: unknown }).documentPictureInPicture
  document.documentElement.removeAttribute("class")
  document.head.querySelectorAll("[data-test-look]").forEach((el) => el.remove())
})

/** A stylesheet of the app's that the window can only link (another origin's): the window waits for it. */
function linkedSheet() {
  document.head.insertAdjacentHTML("beforeend", '<link data-test-look rel="stylesheet" href="https://cdn.example/x.css">')
  const link = document.head.lastElementChild as HTMLLinkElement
  Object.defineProperty(link, "sheet", {
    configurable: true,
    value: {
      href: link.href,
      get cssRules(): never {
        throw new DOMException("another origin's", "SecurityError")
      },
    },
  })
}

describe("usePipWindow (meet-14: picture-in-picture from the dock)", () => {
  it("has no window to offer where the browser has no Document Picture-in-Picture", async () => {
    const { result } = renderHook(() => usePipWindow())
    expect(result.current.kind).not.toBe("document")
    await act(async () => expect(await result.current.open()).toBeNull())
    expect(result.current.win).toBeNull()
  })

  it("opens one window at the size asked, dressed like the app", async () => {
    const pip = fakeDocumentPip()
    document.documentElement.className = "dark"
    const { result } = renderHook(() => usePipWindow())
    expect(result.current.kind).toBe("document")
    await act(async () => void (await result.current.open({ width: 360, height: 240 })))
    expect(pip.requestWindow).toHaveBeenCalledWith({ width: 360, height: 240 })
    expect(result.current.win).toBe(pip.opened[0])
    expect(pip.opened[0].document.documentElement.className).toBe("dark")
    // Asked again while it's open, it's the same window.
    await act(async () => void (await result.current.open({ width: 360, height: 240 })))
    expect(pip.requestWindow).toHaveBeenCalledTimes(1)
  })

  it("forgets the window when the person closes it", async () => {
    const pip = fakeDocumentPip()
    const { result } = renderHook(() => usePipWindow())
    await act(async () => void (await result.current.open()))
    expect(pip.opened).toHaveLength(1)
    act(() => void pip.opened[0].dispatchEvent(new Event("pagehide")))
    expect(result.current.win).toBeNull()
  })

  it("closes the window when asked, and when the call goes away", async () => {
    const pip = fakeDocumentPip()
    const { result, unmount } = renderHook(() => usePipWindow())
    await act(async () => void (await result.current.open()))
    expect(pip.opened).toHaveLength(1)
    act(() => result.current.close())
    expect(pip.opened[0].close).toHaveBeenCalledTimes(1)
    expect(result.current.win).toBeNull()
    await act(async () => void (await result.current.open()))
    unmount()
    expect(pip.opened[1].close).toHaveBeenCalledTimes(1)
  })

  it("draws the window only once it's dressed: a sheet still loading holds it", async () => {
    const pip = fakeDocumentPip()
    linkedSheet()
    const { result } = renderHook(() => usePipWindow())
    let opening: Promise<Window | null> | undefined
    act(() => void (opening = result.current.open()))
    await vi.waitFor(() => expect(pip.opened).toHaveLength(1))
    await act(async () => {})
    expect(result.current.win, "not drawn while its sheet loads").toBeNull()
    await act(async () => {
      pip.opened[0].document.head.querySelector('link[rel="stylesheet"]')!.dispatchEvent(new Event("load"))
      await opening
    })
    expect(result.current.win).toBe(pip.opened[0])
  })

  it("never draws a window the person closed while it was being dressed", async () => {
    const pip = fakeDocumentPip()
    linkedSheet()
    const { result } = renderHook(() => usePipWindow())
    let opening: Promise<Window | null> | undefined
    act(() => void (opening = result.current.open()))
    await vi.waitFor(() => expect(pip.opened).toHaveLength(1))
    act(() => void pip.opened[0].dispatchEvent(new Event("pagehide")))
    let got: Window | null | undefined
    await act(async () => {
      pip.opened[0].document.head.querySelector('link[rel="stylesheet"]')!.dispatchEvent(new Event("load"))
      got = await opening
    })
    expect(got, "open gives no window").toBeNull()
    expect(result.current.win).toBeNull()
  })
})

/**
 * A stand-in for a <video>'s own picture-in-picture: the document knows which
 * video is out and says when that changes, as the browser's does.
 */
function fakeVideoPip(refuse = false) {
  let current: Element | null = null
  Object.defineProperty(document, "pictureInPictureEnabled", { value: true, configurable: true })
  Object.defineProperty(document, "pictureInPictureElement", { get: () => current, configurable: true })
  const exitPictureInPicture = vi.fn(async () => {
    const was = current
    current = null
    was?.dispatchEvent(new Event("leavepictureinpicture", { bubbles: true }))
  })
  Object.defineProperty(document, "exitPictureInPicture", { value: exitPictureInPicture, configurable: true })
  const video = document.createElement("video")
  document.body.appendChild(video)
  Object.defineProperty(video, "requestPictureInPicture", {
    value: vi.fn(async () => {
      if (refuse) throw new DOMException("no tap to open it from", "NotAllowedError")
      current = video
      video.dispatchEvent(new Event("enterpictureinpicture", { bubbles: true }))
    }),
  })
  return { video, exitPictureInPicture, out: (el: Element | null) => void (current = el) }
}

describe("a video's own picture-in-picture, where the browser has only that", () => {
  afterEach(() => {
    for (const k of ["pictureInPictureEnabled", "pictureInPictureElement", "exitPictureInPicture"]) delete (document as unknown as Record<string, unknown>)[k]
    document.body.replaceChildren()
  })

  it("pops a <video> out, knows it's out, and close takes it back", async () => {
    const pip = fakeVideoPip()
    const { result } = renderHook(() => usePipWindow())
    expect(result.current.kind).toBe("video")
    await act(async () => expect(await result.current.openVideo(pip.video)).toBe(true))
    expect(result.current.video).toBe(pip.video)
    await act(async () => result.current.close())
    expect(pip.exitPictureInPicture).toHaveBeenCalledTimes(1)
    expect(result.current.video).toBeNull()
  })

  it("says so when the browser won't pop it out", async () => {
    const pip = fakeVideoPip(true)
    const { result } = renderHook(() => usePipWindow())
    await act(async () => expect(await result.current.openVideo(pip.video)).toBe(false))
    expect(result.current.video).toBeNull()
  })

  it("never takes back a picture-in-picture it didn't open", () => {
    const pip = fakeVideoPip()
    pip.out(document.createElement("video"))
    const { result, unmount } = renderHook(() => usePipWindow())
    act(() => result.current.close())
    unmount()
    expect(pip.exitPictureInPicture).not.toHaveBeenCalled()
  })
})
