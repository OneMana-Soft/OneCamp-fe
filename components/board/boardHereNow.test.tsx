import { afterEach, describe, expect, it, vi } from "vitest"
import * as React from "react"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { boardScene } from "@/lib/testing/boardScene"
import { DocBusContext } from "@/components/docEditor/registry/commandBus"
import PresenceList from "@/components/docEditor/presence/PresenceList"
import { usePresence } from "@/components/docEditor/presence/store"
import type { ActiveUser } from "@/components/docEditor/ActiveUsersBar"
import { centreOn } from "@/lib/board/hereNow"
import { boardBusOf } from "@/lib/board/hereBus"
import { followView } from "@/lib/board/viewport"
import { BoardHereNow } from "./boardHereNow"

// Here now on a board (miro-04 4), through the presence stack's own list: Jump
// to puts the person's pointer in the middle of this screen; Follow keeps it
// there as they move, until this person moves the board themselves, presses
// Escape, or the one followed leaves.

type Change = { added: number[]; updated: number[]; removed: number[] }

/** A few frames: who is here is read at most once a frame. */
const frames = () =>
  new Promise<void>((done) => {
    const next = (left: number) => (left ? requestAnimationFrame(() => next(left - 1)) : done())
    next(3)
  })

/** A collaboration's awareness, as far as Here now reads it: each tab's state by client, and its changes. */
function awarenessFor(self: number) {
  const states = new Map<number, Record<string, unknown>>()
  const heard = new Set<(c: Change) => void>()
  const tell = (c: Change) => act(() => heard.forEach((l) => l(c)))
  return {
    awareness: {
      clientID: self,
      getStates: () => states,
      getLocalState: () => states.get(self) ?? null,
      // This tab saying something of its own (its idle state) is a change the others hear, as on a real awareness.
      setLocalStateField(field: string, value: unknown) {
        const had = states.has(self)
        states.set(self, { ...states.get(self), [field]: value })
        tell({ added: had ? [] : [self], updated: had ? [self] : [], removed: [] })
      },
      on: (_: "change", l: (c: Change) => void) => void heard.add(l),
      off: (_: "change", l: (c: Change) => void) => void heard.delete(l),
    },
    /** A tab names its person and says where it points (a pointer in the board's coordinates). */
    tab(client: number, state: Record<string, unknown>) {
      const had = states.has(client)
      states.set(client, state)
      tell({ added: had ? [] : [client], updated: had ? [client] : [], removed: [] })
    },
    leave(client: number) {
      states.delete(client)
      tell({ added: [], updated: [], removed: [client] })
    },
  }
}

const SAM = { id: "u-sam", name: "Sam Rivera" }
const ANN = { id: "u-ann", name: "Ann Lee" }
const VIC = { id: "u-vic", name: "Vic Lead" }
const users: ActiveUser[] = [
  { id: ANN.id, name: ANN.name, color: "#c2410c" },
  { id: SAM.id, name: SAM.name, color: "#2563eb" },
]

function Board({ provider, api, editable = false, synced = true }: { provider: unknown; api: unknown; editable?: boolean; synced?: boolean }) {
  const [host, setHost] = React.useState<HTMLDivElement | null>(null)
  const bus = React.useMemo(() => boardBusOf("b1"), [])
  return (
    <div ref={setHost} data-board-page="">
      <div className="excalidraw" data-testid="board" />
      <BoardHereNow provider={provider as never} api={api as never} boardId="b1" host={host} editable={editable} synced={synced} />
      <DocBusContext.Provider value={bus}>
        <PresenceList users={users} onDone={() => {}} />
      </DocBusContext.Provider>
    </div>
  )
}

/** Sam's board (1000 x 800 at 100%), with Ann on it in another tab, pointing at (500, 300). */
function open() {
  const s = boardScene()
  const a = awarenessFor(1)
  a.tab(1, { user: SAM })
  a.tab(7, { user: ANN, pointer: { x: 500, y: 300 } })
  render(<Board provider={{ awareness: a.awareness }} api={s.api} />)
  const camera = () => s.writes.at(-1)?.appState
  return { s, a, camera }
}
const SCREEN = { width: 1000, height: 800, zoom: 1 }
const annAt = (x: number, y: number) => ({ user: ANN, pointer: { x, y } })
/** Ann as the relay stamps her when she may edit the board (her user says edit), so her bring moves the others. */
const annEditing = (x: number, y: number) => ({ ...annAt(x, y), user: { ...ANN, edit: true } })

afterEach(cleanup)

describe("Here now on a board", () => {
  it("lists the people on the board, and Jump to puts someone's pointer in the middle of this screen", () => {
    const { s, camera } = open()
    expect(screen.queryByRole("button", { name: `Jump to ${SAM.name}` })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: `Jump to ${ANN.name}` }))
    expect(camera()).toEqual(centreOn(SCREEN, { x: 500, y: 300 }))
    expect(camera()).toEqual({ scrollX: 0, scrollY: 100 })
    expect(s.writes).toHaveLength(1)
  })

  it("follows someone as they point elsewhere, until this person moves the board themselves", () => {
    const { s, a, camera } = open()
    fireEvent.click(screen.getByRole("button", { name: `Follow ${ANN.name}` }))
    expect(camera()).toEqual(centreOn(SCREEN, { x: 500, y: 300 }))
    const stop = screen.getByRole("button", { name: `Stop following ${ANN.name}` })
    expect(stop.textContent).toBe("Following")

    a.tab(7, annAt(900, 700))
    expect(camera()).toEqual(centreOn(SCREEN, { x: 900, y: 700 }))

    // A press on the board is this person moving it: following stops, and her next move is hers alone.
    fireEvent.pointerDown(screen.getByTestId("board"))
    expect(screen.getByRole("button", { name: `Follow ${ANN.name}` })).toBeTruthy()
    const writes = s.writes.length
    a.tab(7, annAt(100, 100))
    expect(s.writes).toHaveLength(writes)
  })

  it("stops following on Escape, on a scroll of the board, and when the one followed leaves", async () => {
    const { s, a } = open()
    const follow = () => fireEvent.click(screen.getByRole("button", { name: `Follow ${ANN.name}` }))
    const stillFollowing = () => {
      const writes = s.writes.length
      a.tab(7, annAt(40 + writes, 40))
      return s.writes.length > writes
    }

    follow()
    fireEvent.keyDown(window, { key: "Escape" })
    expect(stillFollowing()).toBe(false)

    follow()
    expect(stillFollowing()).toBe(true)
    fireEvent.wheel(screen.getByTestId("board"))
    expect(stillFollowing()).toBe(false)

    follow()
    a.leave(7)
    // The list hears who is here once a frame.
    await act(frames)
    expect(screen.queryByRole("button", { name: /Stop following/ })).toBeNull()
    expect(screen.queryByRole("button", { name: `Jump to ${ANN.name}` })).toBeNull()
  })

  it("publishes who is here only on news: a collaborator's pointer moving notifies the store at most once", async () => {
    const { a } = open()
    let renders = 0
    function Reader() {
      usePresence(boardBusOf("b1").key)
      renders++
      return null
    }
    render(<Reader />)
    await act(frames)
    const before = renders
    for (let i = 0; i < 20; i++) a.tab(7, annAt(500 + i, 300 + i))
    await act(frames)
    expect(renders - before).toBeLessThanOrEqual(1)
  })

  it("says it is following: a frame names the one followed with Esc and Stop, and a status says when it starts and stops", async () => {
    const { a } = open()
    const follow = () => fireEvent.click(screen.getByRole("button", { name: `Follow ${ANN.name}` }))
    const framed = () => screen.queryByText(`Following ${ANN.name}`)
    const started = `Following ${ANN.name}. Press Esc to stop.`
    const stopped = `Stopped following ${ANN.name}`

    follow()
    expect(framed()).toBeTruthy()
    expect(screen.getByText("Esc")).toBeTruthy()
    expect(screen.getByText(started)).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Stop" }))
    expect(framed()).toBeNull()
    expect(screen.getByText(stopped)).toBeTruthy()

    // Escape, and this person moving the board (a press, a scroll), each end it the same way.
    const board = () => screen.getByTestId("board")
    for (const end of [() => fireEvent.keyDown(window, { key: "Escape" }), () => fireEvent.pointerDown(board()), () => fireEvent.wheel(board())]) {
      follow()
      expect(screen.getByText(started)).toBeTruthy()
      end()
      expect(framed()).toBeNull()
      expect(screen.getByText(stopped)).toBeTruthy()
    }

    // The one followed leaving ends it too, and says why.
    follow()
    a.leave(7)
    await act(frames)
    expect(framed()).toBeNull()
    expect(screen.getByText(`${ANN.name} left the board, so you're no longer following them`)).toBeTruthy()
  })

  it("has nothing to jump to for someone who hasn't pointed at the board", () => {
    const s = boardScene()
    const a = awarenessFor(1)
    a.tab(1, { user: SAM })
    a.tab(7, { user: ANN })
    render(<Board provider={{ awareness: a.awareness }} api={s.api} />)
    fireEvent.click(screen.getByRole("button", { name: `Jump to ${ANN.name}` }))
    expect(s.writes).toHaveLength(0)
  })
})

// Bring everyone here (miro-21 1): only someone who may edit the board brings; every other tab shows the place once,
// fitted to its own screen; a tab that opens later is never moved by a bring made before it came.
describe("Bring everyone here on a board", () => {
  it("is offered only to those who may edit the board, and says where this screen looks under a new id each time", () => {
    const s = boardScene([], { scrollX: -200, scrollY: 50 })
    const a = awarenessFor(1)
    a.tab(1, { user: SAM })
    a.tab(7, annAt(500, 300))
    const { rerender } = render(<Board provider={{ awareness: a.awareness }} api={s.api} />)
    expect(screen.queryByRole("button", { name: "Bring everyone here" })).toBeNull()
    rerender(<Board provider={{ awareness: a.awareness }} api={s.api} editable />)
    fireEvent.click(screen.getByRole("button", { name: "Bring everyone here" }))
    const first = a.awareness.getLocalState()?.bring as { id: string; view: unknown }
    expect(first.view).toEqual({ scrollX: -200, scrollY: 50, zoom: 1, width: 1000, height: 800 })
    fireEvent.click(screen.getByRole("button", { name: "Bring everyone here" }))
    expect((a.awareness.getLocalState()?.bring as { id: string }).id).not.toBe(first.id)
    // Bringing never moves the one who brings.
    expect(s.writes).toHaveLength(0)
  })

  it("shows another tab's bring once, fitted to this screen, and never one made before this tab opened", () => {
    const s = boardScene()
    const a = awarenessFor(1)
    const view = { scrollX: -400, scrollY: -300, zoom: 2, width: 1600, height: 900 }
    a.tab(1, { user: SAM })
    a.tab(7, { ...annEditing(500, 300), bring: { id: "before", view } })
    render(<Board provider={{ awareness: a.awareness }} api={s.api} />)
    a.tab(7, { ...annEditing(510, 300), bring: { id: "before", view } })
    expect(s.writes, "a bring made before this tab opened").toHaveLength(0)
    a.tab(7, { ...annEditing(510, 300), bring: { id: "now", view } })
    const f = followView(view, { width: 1000, height: 800 })
    expect(s.writes.at(-1)?.appState).toEqual({ scrollX: f.scrollX, scrollY: f.scrollY, zoom: { value: f.zoom } })
    const shown = s.writes.length
    a.tab(7, { ...annEditing(600, 300), bring: { id: "now", view } })
    expect(s.writes, "the same bring again").toHaveLength(shown)
  })

  // Here now is drawn on the connection, before the first sync brings who is already on the board (CODE-REVIEW-LOG
  // row 2308): a bring that arrives before that sync was made before this tab came.
  it("never shows a bring that arrives before the first sync, though the board was drawn first, and shows the next", () => {
    const s = boardScene()
    const a = awarenessFor(1)
    const view = { scrollX: -400, scrollY: -300, zoom: 2, width: 1600, height: 900 }
    a.tab(1, { user: SAM })
    const page = render(<Board provider={{ awareness: a.awareness }} api={s.api} synced={false} />)
    a.tab(7, { ...annEditing(500, 300), bring: { id: "before", view } })
    page.rerender(<Board provider={{ awareness: a.awareness }} api={s.api} synced />)
    a.tab(7, { ...annEditing(510, 300), bring: { id: "before", view } })
    expect(s.writes, "a bring made before this tab came").toHaveLength(0)
    a.tab(7, { ...annEditing(510, 300), bring: { id: "now", view } })
    const f = followView(view, { width: 1000, height: 800 })
    expect(s.writes.at(-1)?.appState).toEqual({ scrollX: f.scrollX, scrollY: f.scrollY, zoom: { value: f.zoom } })
  })

  // CODE-REVIEW-LOG row 2311, F3: a bring made after the first sync, while the board's drawing hadn't come, is news.
  it("shows a bring made after the first sync but before the board's drawing came, once, when it comes", () => {
    const s = boardScene()
    const a = awarenessFor(1)
    const view = { scrollX: -400, scrollY: -300, zoom: 2, width: 1600, height: 900 }
    a.tab(1, { user: SAM })
    const page = render(<Board provider={{ awareness: a.awareness }} api={null} />)
    a.tab(7, { ...annEditing(500, 300), bring: { id: "early", view } })
    page.rerender(<Board provider={{ awareness: a.awareness }} api={s.api} />)
    const f = followView(view, { width: 1000, height: 800 })
    expect(s.writes.map((w) => w.appState)).toEqual([{ scrollX: f.scrollX, scrollY: f.scrollY, zoom: { value: f.zoom } }])
  })

  // Main's ruling (1 Nov): the relay stamps each person's user with edit from the board's member list, and a tab
  // honours a bring only from edit: true, so a viewer's tab claiming to bring everyone moves nobody.
  it("never moves this screen for a bring from someone the relay doesn't stamp an editor", () => {
    const s = boardScene()
    const a = awarenessFor(1)
    const view = { scrollX: -400, scrollY: -300, zoom: 2, width: 1600, height: 900 }
    a.tab(1, { user: SAM })
    render(<Board provider={{ awareness: a.awareness }} api={s.api} />)
    a.tab(7, { ...annAt(500, 300), user: { ...ANN, edit: false }, bring: { id: "forged", view } })
    a.tab(8, { user: { id: "u-vic", name: "Vic Reader" }, bring: { id: "forged-2", view } })
    expect(s.writes, "a bring from a viewer, or from a tab the relay didn't stamp").toHaveLength(0)
  })
})

// Follow shows what the one followed sees (miro-21 2: follow anyone from their face), as a doc's Follow does
// (presence/people): this tab says whom it follows, and that tab says what it shows only while someone follows it.
describe("Follow on a board shows what the one followed sees", () => {
  const VIEW = { scrollX: -400, scrollY: -200, zoom: 2, width: 390, height: 700 }
  /** The camera that shows `view` on Sam's 1000 x 800 screen, as followScene writes it. */
  const fitted = (view: typeof VIEW) => {
    const f = followView(view, SCREEN)
    return { scrollX: f.scrollX, scrollY: f.scrollY, zoom: { value: f.zoom } }
  }
  const mine = (a: ReturnType<typeof open>["a"]) => a.awareness.getLocalState() as Record<string, unknown> | null

  it("says whom this tab follows, and shows what their tab says it shows, fitted to this screen, not their pointer", () => {
    const { s, a, camera } = open()
    // Opening says nothing of following: a tab that follows no one sends nothing more.
    expect(mine(a) ?? {}).not.toHaveProperty("following")
    fireEvent.click(screen.getByRole("button", { name: `Follow ${ANN.name}` }))
    expect(mine(a)?.following).toBe(7)
    // Until her tab says what it shows, her pointer is where to look.
    expect(camera()).toEqual(centreOn(SCREEN, { x: 500, y: 300 }))
    a.tab(7, { ...annAt(500, 300), view: VIEW })
    expect(camera()).toEqual(fitted(VIEW))
    // Her pointer moving alone moves nothing while her tab says what it shows.
    const writes = s.writes.length
    a.tab(7, { ...annAt(900, 700), view: VIEW })
    expect(s.writes).toHaveLength(writes)
    // She pans and zooms: this screen shows her new view, fitted again.
    const next = { ...VIEW, scrollX: -1200, zoom: 0.5 }
    a.tab(7, { ...annAt(900, 700), view: next })
    expect(camera()).toEqual(fitted(next))
  })

  it("starts on what they show when their tab says it already, and stops saying whom it follows when following stops", () => {
    const { a, camera } = open()
    a.tab(7, { ...annAt(500, 300), view: VIEW })
    fireEvent.click(screen.getByRole("button", { name: `Follow ${ANN.name}` }))
    expect(camera()).toEqual(fitted(VIEW))
    fireEvent.pointerDown(screen.getByTestId("board"))
    expect(mine(a)?.following).toBeNull()
  })

  it("says what this tab shows only while someone follows it, as the board moves, never the same view twice, and stops after", async () => {
    const { s, a } = open()
    const api = s.api as unknown as { updateScene: (scene: { appState?: Record<string, unknown> }) => void }
    expect(mine(a)?.view ?? null).toBeNull()
    // Ann follows Sam (this tab is client 1): his tab says what it shows.
    a.tab(7, { ...annAt(500, 300), following: 1 })
    await waitFor(() => expect(mine(a)?.view).toEqual({ scrollX: 0, scrollY: 0, zoom: 1, width: 1000, height: 800 }))
    act(() => api.updateScene({ appState: { scrollX: -50, scrollY: 20 } }))
    await waitFor(() => expect(mine(a)?.view).toEqual({ scrollX: -50, scrollY: 20, zoom: 1, width: 1000, height: 800 }))
    // A change that leaves the view where it is says nothing more.
    const said = vi.spyOn(a.awareness, "setLocalStateField")
    act(() => api.updateScene({ appState: { selectedElementIds: {} } }))
    await new Promise((done) => setTimeout(done, 250))
    expect(said.mock.calls.filter(([field]) => field === "view")).toHaveLength(0)
    // Ann stops following: his tab says nothing of what it shows.
    a.tab(7, annAt(500, 300))
    expect(mine(a)?.view).toBeNull()
  })

  it("says what this tab shows again when someone follows it anew, though the board hasn't moved", async () => {
    const { a } = open()
    const home = { scrollX: 0, scrollY: 0, zoom: 1, width: 1000, height: 800 }
    a.tab(7, { ...annAt(500, 300), following: 1 })
    await waitFor(() => expect(mine(a)?.view).toEqual(home))
    a.tab(7, annAt(500, 300))
    expect(mine(a)?.view).toBeNull()
    a.tab(7, { ...annAt(500, 300), following: 1 })
    await waitFor(() => expect(mine(a)?.view, "the same view, said again to a new follow").toEqual(home))
  })

  // CODE-REVIEWER-162 (row 2276, F1): two people following each other on screens of different shapes each fitted the
  // other's fit, so the region grew every round trip until both boards sat at the zoom floor.
  it("says the view it follows while it follows, so two screens of different shapes following each other keep their zoom", async () => {
    const { a, camera } = open()
    fireEvent.click(screen.getByRole("button", { name: `Follow ${ANN.name}` }))
    // Ann's phone follows Sam back, and says what it shows.
    const PHONE = { width: VIEW.width, height: VIEW.height }
    let hers = VIEW
    a.tab(7, { ...annAt(500, 300), following: 1, view: hers })
    for (let round = 0; round < 4; round++) {
      // Sam's tab says the view it follows, as Ann's tab said it: never his own camera, fitted round it.
      await waitFor(() => expect(mine(a)?.view).toEqual(hers))
      // Ann's phone shows what Sam's tab says, fitted to her screen, and says that.
      const f = followView(mine(a)!.view as typeof VIEW, PHONE)
      hers = { scrollX: f.scrollX, scrollY: f.scrollY, zoom: f.zoom, width: PHONE.width, height: PHONE.height }
      a.tab(7, { ...annAt(500, 300), following: 1, view: hers })
    }
    expect(hers.zoom).toBeCloseTo(VIEW.zoom, 9)
    expect((camera()?.zoom as { value: number }).value).toBeCloseTo(fitted(VIEW).zoom.value, 9)
  })

  it("ends following when another editor brings everyone, so the next change of the one followed takes nobody back", () => {
    const { s, a, camera } = open()
    a.tab(7, { ...annAt(500, 300), view: VIEW })
    fireEvent.click(screen.getByRole("button", { name: `Follow ${ANN.name}` }))
    expect(screen.queryByText(`Following ${ANN.name}`)).toBeTruthy()
    const brought = { scrollX: -900, scrollY: -100, zoom: 1, width: 1200, height: 900 }
    a.tab(9, { user: { id: "u-vic", name: "Vic Lead", edit: true }, bring: { id: "b9", view: brought } })
    const f = followView(brought, SCREEN)
    expect(camera()).toEqual({ scrollX: f.scrollX, scrollY: f.scrollY, zoom: { value: f.zoom } })
    expect(screen.queryByText(`Following ${ANN.name}`), "the frame goes with the follow").toBeNull()
    expect(mine(a)?.following).toBeNull()
    const writes = s.writes.length
    a.tab(7, { ...annAt(900, 700), view: { ...VIEW, scrollX: -1500 } })
    expect(s.writes, "Ann's next change moves nothing").toHaveLength(writes)
  })

  // CODE-REVIEWER-163 (V-290, F1b): a tab in the middle of a chain says each new view of the one it follows, even when
  // showing it leaves its own board where it was, so whoever follows it is told of the change.
  it("says the new view of the one it follows though its own board doesn't move, so a chain hears every change", async () => {
    const { s, a } = open()
    a.tab(7, { ...annAt(500, 300), view: VIEW })
    fireEvent.click(screen.getByRole("button", { name: `Follow ${ANN.name}` }))
    a.tab(9, { user: VIC, following: 1 })
    await waitFor(() => expect(mine(a)?.view).toEqual(VIEW))
    // Ann's window narrows round the same middle: 150 of the board across instead of 195, the same 350 down. Sam's
    // wide screen fits it by its height as before, so his board stays; a tall screen following him fits it anew.
    const narrower = { ...VIEW, scrollX: VIEW.scrollX - 22.5, width: 300 }
    const writes = s.writes.length
    a.tab(7, { ...annAt(500, 300), view: narrower })
    expect(s.writes, "Sam's board stays where it is").toHaveLength(writes)
    await waitFor(() => expect(mine(a)?.view, "Sam's tab says Ann's new view").toEqual(narrower))
  })

  // CODE-REVIEWER-163 (V-290, F1c): someone followed whose tab says no view (an older tab mid-deploy, or before its
  // first say) leaves the follower's own camera as what it shows; it says that, so whoever follows it sees it too.
  it("says its own camera while the one it follows says no view, so whoever follows it still sees what it shows", async () => {
    const { a, camera } = open()
    fireEvent.click(screen.getByRole("button", { name: `Follow ${ANN.name}` }))
    const centred = centreOn(SCREEN, { x: 500, y: 300 })
    expect(camera(), "Ann's tab says no view, so her pointer is in the middle").toEqual(centred)
    a.tab(9, { user: VIC, following: 1 })
    await waitFor(() => expect(mine(a)?.view).toEqual({ ...centred, zoom: 1, width: 1000, height: 800 }))
  })
})
