import * as React from "react"
import * as Y from "yjs"
import { act, cleanup, render, screen, waitFor } from "@testing-library/react"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { followView } from "@/lib/board/viewport"

// The shared board's canvas loads in two steps (the live connection, then the
// drawing library), and each showed a spinner in the middle of an empty page.
// It now holds the canvas's place and says what it is doing. A call's guest
// draws on it once the call lets them and the collaboration server agrees,
// each stroke written to the board as a member's canvas writes it; a share
// link's guest only looks. A call's guest sees everyone's cursor on the board,
// and shows the others their own only while they may draw (main, 27 Oct).

/** The board document's awareness, as y-protocols keeps it: this tab's state and everyone else's. */
class FakeAwareness {
  clientID = 1
  states = new Map<number, Record<string, unknown>>([[1, { mode: "viewing" }]])
  /** Every state this tab published, in order. */
  sent: (Record<string, unknown> | null)[] = []
  private heard = new Set<() => void>()
  getStates() {
    return this.states
  }
  getLocalState() {
    return this.states.get(this.clientID) ?? null
  }
  setLocalState(state: Record<string, unknown> | null) {
    if (state) this.states.set(this.clientID, state)
    else this.states.delete(this.clientID)
    this.sent.push(state)
    this.heard.forEach((f) => f())
  }
  setLocalStateField(field: string, value: unknown) {
    const state = this.getLocalState()
    if (state) this.setLocalState({ ...state, [field]: value })
  }
  on(_: "change", f: () => void) {
    this.heard.add(f)
  }
  off(_: "change", f: () => void) {
    this.heard.delete(f)
  }
  /** Someone else on the board says who they are and where they point. */
  remote(clientId: number, state: Record<string, unknown>) {
    this.states.set(clientId, state)
    this.heard.forEach((f) => f())
  }
}

let collab: { provider: { document: Y.Doc; awareness?: FakeAwareness } | null; synced: boolean; readOnly: boolean } = { provider: null, synced: false, readOnly: true }
const asked: unknown[] = []
vi.mock("@/hooks/useCollaborationProvider", () => ({ useCollaborationProvider: (c: unknown) => (asked.push(c), collab) }))
vi.mock("@excalidraw/excalidraw/index.css", () => ({}))
// The toasts the board says (the page's one Toaster draws them; here they are kept).
const toasts = vi.hoisted(() => [] as Record<string, unknown>[])
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: (t: Record<string, unknown>) => void toasts.push(t) }) }))
// The app's theme as it resolves (next-themes): a share link's canvas follows it.
let appTheme: string | undefined = "light"
vi.mock("next-themes", () => ({ useTheme: () => ({ resolvedTheme: appTheme }) }))
let scene: { id: string; version: number; versionNonce: number; isDeleted: boolean }[] = []
/** Excalidraw is still loading its own (empty) scene, which replaces whatever was put on before it. */
let loading = false
const api = {
  getSceneElementsIncludingDeleted: () => scene,
  getSceneElements: () => scene.filter((e) => !e.isDeleted),
  updateScene: vi.fn(),
  addFiles: vi.fn(),
  scrollToContent: vi.fn(),
  // Scrolled 100 right and 50 down, at 2x: a pointer at board (5, 6) is on screen at (210, 112).
  getAppState: () => ({ scrollX: 100, scrollY: 50, zoom: { value: 2 }, width: 800, height: 600, isLoading: loading }),
  onScrollChange: () => () => {},
  onChange: () => () => {},
}
let canvas: Record<string, unknown> = {}
vi.mock("next/dynamic", () => ({
  default: () =>
    function Excalidraw(props: Record<string, unknown>) {
      canvas = props
      React.useEffect(() => {
        ;(props.excalidrawAPI as (a: typeof api) => void)(api)
      }, [props.excalidrawAPI])
      return null
    },
}))

import { GuestBoardViewer } from "./GuestBoardViewer"

const viewer = (more: Partial<React.ComponentProps<typeof GuestBoardViewer>> = {}) => (
  <GuestBoardViewer documentName="board:b1" boardId="b1" token="tok" tokenFetcher={async () => "jwt"} {...more} />
)

afterEach(() => {
  cleanup()
  collab = { provider: null, synced: false, readOnly: true }
  asked.length = 0
  scene = []
  canvas = {}
  loading = false
  api.updateScene.mockClear()
})

// Excalidraw loads its own (empty) scene after it mounts and then replaces
// every element with it, so a drawing put on before that is wiped: the
// member's canvas waits for it, and a guest's has to as well.
describe("a guest's live board and Excalidraw's own scene", () => {
  it("draws the document only once Excalidraw has loaded its own scene", async () => {
    const doc = new Y.Doc()
    doc.getMap("elements").set("n1", { id: "n1", type: "rectangle", index: "a0", version: 1, versionNonce: 1, x: 0, y: 0 })
    loading = true
    collab = { provider: { document: doc }, synced: true, readOnly: true }
    render(viewer())
    await new Promise((r) => requestAnimationFrame(() => r(null)))
    expect(api.updateScene).not.toHaveBeenCalledWith(expect.objectContaining({ elements: expect.anything() }))
    loading = false
    await waitFor(() => expect(api.updateScene).toHaveBeenCalledWith(expect.objectContaining({ elements: [expect.objectContaining({ id: "n1" })] })))
  })
})

/** The cursors drawn over the canvas: each one's name, where it is on screen, and its tag's colours. */
const cursorsDrawn = () =>
  Array.from(document.querySelectorAll<HTMLElement>("[data-board-cursors] [data-cursor]")).map((el) => {
    const tag = el.querySelector<HTMLElement>("[data-cursor-tag]")
    return { name: el.dataset.cursor, at: el.style.transform, fill: tag?.style.background, text: tag?.style.color }
  })

// A whiteboard in a doc (miro-34) shows a member the board through this view.
// Its pictures come by the member's own access, as on the board's page; a
// guest's by the share link's or the call's token, once it is there.
describe("the board's pictures", () => {
  const withPicture = () => {
    const doc = new Y.Doc()
    doc.getMap("files").set("f1", { id: "f1", objectUuid: "o1", mimeType: "image/png" })
    collab = { provider: { document: doc }, synced: true, readOnly: true }
  }
  const picturesAdded = () => api.addFiles.mock.calls.flatMap(([files]) => (files as { id: string; dataURL: string }[]).map((f) => `${f.id} ${f.dataURL}`))

  it("come to a member by the address the reader's page gives, with no token", async () => {
    api.addFiles.mockClear()
    withPicture()
    render(viewer({ token: "", imageURL: (objectUuid) => `/board/getBoardAttachment/b1/${objectUuid}` }))
    await waitFor(() => expect(picturesAdded()).toEqual(["f1 /board/getBoardAttachment/b1/o1"]))
  })

  it("come to a guest through the guest's grant, and wait for a call's guest's token", async () => {
    api.addFiles.mockClear()
    withPicture()
    const { unmount } = render(viewer({ token: "" }))
    await new Promise((r) => requestAnimationFrame(() => r(null)))
    expect(picturesAdded()).toEqual([])
    unmount()
    withPicture()
    render(viewer())
    await waitFor(() => expect(picturesAdded()).toEqual([expect.stringMatching(/^f1 .*\/guest\/board-attachment\/tok\/o1$/)]))
  })
})

describe("a guest's live board before it connects", () => {
  it("holds the canvas's place and says so, without a spinner", () => {
    render(viewer())
    expect(screen.getByRole("status")).toHaveTextContent("Opening the board…")
    expect(document.querySelector(".animate-spin")).toBeNull()
  })
})

describe("a call's guest drawing on the board on its stage", () => {
  it("writes the guest's strokes to the board, named as a guest, with no picture tool", async () => {
    const doc = new Y.Doc()
    collab = { provider: { document: doc }, synced: true, readOnly: false }
    render(viewer({ canDraw: true, user: { id: "guest-p1", name: "Priya (guest)" } }))
    await waitFor(() => expect(canvas.viewModeEnabled).toBe(false))
    expect(asked.at(-1)).toMatchObject({ username: "Priya (guest)", userId: "guest-p1" })
    expect((canvas.UIOptions as { tools?: { image?: boolean } }).tools?.image).toBe(false)
    scene = [{ id: "s1", version: 1, versionNonce: 5, isDeleted: false }]
    act(() => (canvas.onChange as (els: unknown[]) => void)(scene))
    expect(doc.getMap("elements").get("s1")).toMatchObject({ id: "s1", version: 1, versionNonce: 5 })
  })

  it("names the guest as the maker of a note they add or copy, and leaves a member's note its own", async () => {
    const doc = new Y.Doc()
    const note = (id: string) => ({ id, type: "rectangle", version: 1, versionNonce: 2, isDeleted: false, customData: { kind: "note" } })
    doc.getMap("elements").set("m1", note("m1"))
    doc.getMap("noteAuthors").set("m1", { id: "u-sam", name: "Sam Rivera" })
    collab = { provider: { document: doc }, synced: true, readOnly: false }
    render(viewer({ canDraw: true, user: { id: "guest-p1", name: "Priya (guest)" } }))
    await waitFor(() => expect(canvas.viewModeEnabled).toBe(false))
    scene = [note("m1"), note("g1")]
    act(() => (canvas.onChange as (els: unknown[]) => void)(scene))
    expect(doc.getMap("noteAuthors").toJSON()).toEqual({ m1: { id: "u-sam", name: "Sam Rivera" }, g1: { id: "guest-p1", name: "Priya (guest)" } })
  })

  it("draws a member's stroke for a guest who may draw, and sends theirs to the member without taking it back as a teammate's", async () => {
    // The guest's document and a member's, joined as the collaboration server joins them.
    const guestDoc = new Y.Doc()
    const memberDoc = new Y.Doc()
    guestDoc.on("update", (u: Uint8Array, origin: unknown) => origin !== "server" && Y.applyUpdate(memberDoc, u, "server"))
    memberDoc.on("update", (u: Uint8Array, origin: unknown) => origin !== "server" && Y.applyUpdate(guestDoc, u, "server"))
    collab = { provider: { document: guestDoc }, synced: true, readOnly: false }
    scene = []
    api.updateScene.mockClear()
    render(viewer({ canDraw: true, user: { id: "guest-p1", name: "Priya (guest)" } }))
    await waitFor(() => expect(canvas.viewModeEnabled).toBe(false))

    memberDoc.getMap("elements").set("m1", { id: "m1", version: 1, versionNonce: 3, isDeleted: false })
    await waitFor(() => expect(api.updateScene).toHaveBeenCalledWith(expect.objectContaining({ captureUpdate: "NEVER" })))
    const drawn = api.updateScene.mock.calls.at(-1)![0] as { elements: { id: string }[] }
    expect(drawn.elements.map((e) => e.id)).toEqual(["m1"])

    const merges = api.updateScene.mock.calls.length
    scene = [{ id: "m1", version: 1, versionNonce: 3, isDeleted: false }, { id: "g1", version: 1, versionNonce: 8, isDeleted: false }]
    act(() => (canvas.onChange as (els: unknown[]) => void)(scene))
    expect(memberDoc.getMap("elements").get("g1")).toMatchObject({ id: "g1", versionNonce: 8 })
    // The guest's own write is no teammate's change: nothing is merged back onto their canvas.
    await new Promise((r) => setTimeout(r, 50))
    expect(api.updateScene).toHaveBeenCalledTimes(merges)
  })

  it("only looks while the call doesn't let guests draw, or the server holds them read-only", async () => {
    for (const [canDraw, readOnly] of [
      [false, false],
      [true, true],
    ] as const) {
      const doc = new Y.Doc()
      collab = { provider: { document: doc }, synced: true, readOnly }
      render(viewer({ canDraw, user: { id: "guest-p1", name: "Priya (guest)" } }))
      await waitFor(() => expect(canvas.viewModeEnabled).toBe(true))
      expect(canvas.onChange).toBeUndefined()
      cleanup()
    }
  })

  it("leaves a share link's guest looking, as before", async () => {
    collab = { provider: { document: new Y.Doc() }, synced: true, readOnly: false }
    render(viewer())
    await waitFor(() => expect(canvas.viewModeEnabled).toBe(true))
    expect(asked.at(-1)).toMatchObject({ username: "Guest", userId: "guest" })
  })
})

describe("cursors on the board on a call's stage", () => {
  // jsdom lays nothing out: the cursors' layer is 800 x 600 on screen here.
  const sizes = { clientWidth: 800, clientHeight: 600 }
  beforeAll(() => {
    for (const [prop, px] of Object.entries(sizes))
      Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, get(this: HTMLElement) { return this.hasAttribute("data-board-cursors") ? px : 0 } })
  })
  afterAll(() => {
    for (const prop of Object.keys(sizes)) delete (HTMLElement.prototype as unknown as Record<string, unknown>)[prop]
  })
  const priya = { id: "guest-p1", name: "Priya (guest)" }
  const sam = { user: { id: "u-sam", name: "Sam Rivera" }, pointer: { x: 5, y: 6 }, button: "up" }

  it("shows the others where a guest who may draw points, by their guest name, and takes it back when the call stops their drawing", async () => {
    const awareness = new FakeAwareness()
    collab = { provider: { document: new Y.Doc(), awareness }, synced: true, readOnly: false }
    const { rerender } = render(viewer({ canDraw: true, user: priya }))
    await waitFor(() => expect(awareness.getLocalState()?.user).toMatchObject({ id: "guest-p1", name: "Priya (guest)" }))
    act(() => (canvas.onPointerUpdate as (p: unknown) => void)({ pointer: { x: 10, y: 20 }, button: "down" }))
    expect(awareness.getLocalState()).toMatchObject({ pointer: { x: 10, y: 20 }, button: "down" })

    rerender(viewer({ canDraw: false, user: priya }))
    await waitFor(() => expect(canvas.viewModeEnabled).toBe(true))
    expect(awareness.getLocalState()).toMatchObject({ user: null, pointer: null, button: null })
    expect(canvas.onPointerUpdate).toBeUndefined()
  })

  it("publishes nothing for a call's guest who only looks, and draws everyone else's cursor for them", async () => {
    const awareness = new FakeAwareness()
    awareness.remote(7, sam)
    collab = { provider: { document: new Y.Doc(), awareness }, synced: true, readOnly: true }
    render(viewer({ canDraw: false, user: priya, theme: "dark" }))
    // Sam's cursor, where he points on the board, in his own colour on the stage's dark: lake's light ink, its dark ink for his name.
    await waitFor(() => expect(cursorsDrawn()).toEqual([{ name: "Sam Rivera", at: "translate(210px, 112px)", fill: "rgb(163, 230, 236)", text: "rgb(11, 92, 101)" }]))
    expect(canvas.onPointerUpdate).toBeUndefined()
    expect(awareness.sent).toEqual([])
  })

  it("leaves a share link's guest without cursors, theirs or anyone's", async () => {
    const awareness = new FakeAwareness()
    awareness.remote(7, sam)
    collab = { provider: { document: new Y.Doc(), awareness }, synced: true, readOnly: true }
    render(viewer())
    await waitFor(() => expect(canvas.viewModeEnabled).toBe(true))
    // The canvas has its API: the board was read onto it (hydrate marks the count).
    await waitFor(() => expect(document.querySelector("[data-guest-board]")?.getAttribute("data-board-elements")).toBe("0"))
    expect(document.querySelector("[data-board-cursors]")).toBeNull()
    expect(canvas.onPointerUpdate).toBeUndefined()
    expect(awareness.sent).toEqual([])
  })
})

describe("the canvas's theme", () => {
  it("follows the viewer's theme on a share link's page, as a member's board does, and stays dark on a call's stage", async () => {
    collab = { provider: { document: new Y.Doc(), awareness: new FakeAwareness() }, synced: true, readOnly: true }
    appTheme = "dark"
    const { rerender } = render(viewer())
    await waitFor(() => expect(canvas.theme).toBe("dark"))
    appTheme = "light"
    rerender(viewer())
    await waitFor(() => expect(canvas.theme).toBe("light"))
    // The call's stage gives its own, whatever the app's.
    rerender(viewer({ theme: "dark" }))
    await waitFor(() => expect(canvas.theme).toBe("dark"))
  })
})

// Slides control (meet-14): on a call's stage the guest's camera follows the
// room's slide (components/livekit/stageSlides), which reads the frames and
// their kept order through the viewer.
describe("a call's guest and the room's slide", () => {
  const drawn = [{ id: "f1", version: 1, versionNonce: 1, isDeleted: false }]

  it("frames the drawing on a first visit with room round it, never past 100%, but leaves the camera to the stage when the board opens at a slide", async () => {
    scene = drawn
    collab = { provider: { document: new Y.Doc() }, synced: true, readOnly: true }
    api.scrollToContent.mockClear()
    render(viewer())
    await waitFor(() => expect(api.scrollToContent).toHaveBeenCalledWith(drawn, expect.objectContaining({ fitToViewport: true, viewportZoomFactor: 0.9, maxZoom: 1 })))
    cleanup()
    scene = drawn
    api.scrollToContent.mockClear()
    render(viewer({ opensAt: "f1" }))
    // Past the first framing's frame, and its first retry.
    await new Promise((r) => setTimeout(r, 250))
    expect(api.scrollToContent).not.toHaveBeenCalled()
  })

  it("hands the stage Excalidraw's API and the board's document", async () => {
    const doc = new Y.Doc()
    collab = { provider: { document: doc }, synced: true, readOnly: true }
    const ready = vi.fn()
    render(viewer({ onApiReady: ready }))
    await waitFor(() => expect(ready).toHaveBeenCalledWith(api, doc))
  })
})

// A share link's guest is brought and held (miro-21; main 17:3x): they never present, hold or bring, but a presenter's
// view takes them along, fitted to their screen; a hold keeps them there with no way to stop; a bring moves them once,
// with a way back. Only an editor's presenting or bring counts, as for members. A call's guest follows the call's slides.
describe("a share link's guest, brought and held", () => {
  const VIEW = { scrollX: -400, scrollY: -200, zoom: 2, width: 390, height: 700 }
  /** The camera that shows `view` on this 800 x 600 canvas, as followScene writes it. */
  const fitted = (view: typeof VIEW) => {
    const f = followView(view, { width: 800, height: 600 })
    return { scrollX: f.scrollX, scrollY: f.scrollY, zoom: { value: f.zoom } }
  }
  /** Ann as the relay stamps her (an editor unless said), with whatever her tab says. */
  const ann = (more: Record<string, unknown> = {}, edit = true) => ({ user: { id: "u-ann", name: "Ann Lee", edit }, ...more })
  const presenting = (hold = false, edit = true) => ann({ presenting: { userId: "u-ann", name: "Ann Lee", view: VIEW, hold } }, edit)
  const open = async (more: Partial<React.ComponentProps<typeof GuestBoardViewer>> = {}, before?: (a: FakeAwareness) => void) => {
    const awareness = new FakeAwareness()
    before?.(awareness)
    collab = { provider: { document: new Y.Doc(), awareness }, synced: true, readOnly: true }
    render(viewer(more))
    await waitFor(() => expect(canvas.excalidrawAPI).toBeTruthy())
    return awareness
  }
  const moved = (view: typeof VIEW) => api.updateScene.mock.calls.some(([scene]) => JSON.stringify(scene) === JSON.stringify({ appState: fitted(view) }))
  const settle = () => act(() => new Promise<void>((done) => setTimeout(done, 50)))
  afterEach(() => {
    toasts.length = 0
  })

  it("is taken to a presenter's view, fitted to this screen, and says so with a way to stop", async () => {
    const awareness = await open()
    act(() => awareness.remote(4, presenting()))
    await waitFor(() => expect(moved(VIEW)).toBe(true))
    expect(screen.getByText("Following Ann Lee")).toBeTruthy()
    act(() => screen.getByRole("button", { name: "Stop" }).click())
    expect(screen.queryByText("Following Ann Lee")).toBeNull()
  })

  it("held, has no way to stop, and says it is held", async () => {
    const awareness = await open()
    act(() => awareness.remote(4, presenting(true)))
    await waitFor(() => expect(screen.getByText("Following Ann Lee")).toBeTruthy())
    expect(moved(VIEW)).toBe(true)
    expect(screen.getByText("· held")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Stop" })).toBeNull()
  })

  it("never follows a presenting from someone the relay doesn't stamp an editor", async () => {
    const awareness = await open()
    act(() => awareness.remote(4, presenting(false, false)))
    await settle()
    expect(moved(VIEW)).toBe(false)
    expect(screen.queryByText("Following Ann Lee")).toBeNull()
  })

  it("is brought once to an editor's bring, with a way back, and never to one made before it opened", async () => {
    const before = { ...VIEW, scrollX: -9 }
    const awareness = await open({}, (a) => a.remote(5, ann({ bring: { id: "old", view: before } })))
    await settle()
    expect(moved(before), "a bring made before this tab opened").toBe(false)
    act(() => awareness.remote(4, ann({ bring: { id: "b1", view: VIEW } })))
    await waitFor(() => expect(moved(VIEW)).toBe(true))
    expect(toasts).toHaveLength(1)
    expect(toasts[0]).toMatchObject({ title: "Ann Lee brought everyone here" })
    const calls = api.updateScene.mock.calls.length
    act(() => awareness.remote(4, ann({ bring: { id: "b1", view: VIEW } })))
    expect(api.updateScene.mock.calls.length, "once").toBe(calls)
  })

  it("on a call's stage follows the call's slides, never a presenter or a bring", async () => {
    const awareness = await open({ user: { id: "guest-p1", name: "Priya (guest)" } })
    act(() => awareness.remote(4, presenting(true)))
    act(() => awareness.remote(5, ann({ bring: { id: "b2", view: VIEW } })))
    await settle()
    expect(moved(VIEW)).toBe(false)
    expect(screen.queryByText("Following Ann Lee")).toBeNull()
    expect(toasts).toHaveLength(0)
  })
})
