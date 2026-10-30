import { afterEach, describe, expect, it } from "vitest"
import * as React from "react"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { boardScene } from "@/lib/testing/boardScene"
import { DocBusContext } from "@/components/docEditor/registry/commandBus"
import PresenceList from "@/components/docEditor/presence/PresenceList"
import { usePresence } from "@/components/docEditor/presence/store"
import type { ActiveUser } from "@/components/docEditor/ActiveUsersBar"
import { boardBusOf, centreOn } from "@/lib/board/hereNow"
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
const users: ActiveUser[] = [
  { id: ANN.id, name: ANN.name, color: "#c2410c" },
  { id: SAM.id, name: SAM.name, color: "#2563eb" },
]

function Board({ provider, api }: { provider: unknown; api: unknown }) {
  const [host, setHost] = React.useState<HTMLDivElement | null>(null)
  const bus = React.useMemo(() => boardBusOf("b1"), [])
  return (
    <div ref={setHost} data-board-page="">
      <div className="excalidraw" data-testid="board" />
      <BoardHereNow provider={provider as never} api={api as never} boardId="b1" host={host} />
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
