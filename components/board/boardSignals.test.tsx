import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import * as React from "react"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { boardScene } from "@/lib/testing/boardScene"
import { DocBusContext } from "@/components/docEditor/registry/commandBus"
import PresenceList from "@/components/docEditor/presence/PresenceList"
import type { ActiveUser } from "@/components/docEditor/ActiveUsersBar"
import { boardBusOf } from "@/lib/board/hereBus"
import { HAND_FIELD, LOWER_FIELD, REACT_FIELD } from "@/lib/board/signals"
import type { Toast } from "@/hooks/use-toast"

// What the board's signals toast, as its people would read them; one toast function, as the app's is.
const { toasts } = vi.hoisted(() => ({ toasts: [] as Toast[] }))
vi.mock("@/hooks/use-toast", () => {
  const toast = (t: Toast) => void toasts.push(t)
  return { useToast: () => ({ toast }) }
})

import { BoardHereNow } from "./boardHereNow"
import BoardReact from "./boardReact"

// A board's reactions and raised hands (miro-24): a reaction rises from under its sender's face, mine from my React
// button; a hand joins Here now's queue, first raised first, editors hear of it and may lower it, and only an editor's
// word lowers it.

type Change = { added: number[]; updated: number[]; removed: number[] }

/** A few frames: who is here is read at most once a frame. */
const frames = () =>
  act(
    () =>
      new Promise<void>((done) => {
        const next = (left: number) => (left ? requestAnimationFrame(() => next(left - 1)) : done())
        next(3)
      }),
  )

/** A collaboration's awareness, as the board reads it: each tab's state by client, and its changes. */
function awarenessFor(self: number) {
  const states = new Map<number, Record<string, unknown>>()
  const heard = new Set<(c: Change) => void>()
  const tell = (c: Change) => act(() => heard.forEach((l) => l(c)))
  return {
    states,
    awareness: {
      clientID: self,
      getStates: () => states,
      getLocalState: () => states.get(self) ?? null,
      setLocalStateField(field: string, value: unknown) {
        const had = states.has(self)
        states.set(self, { ...states.get(self), [field]: value })
        tell({ added: had ? [] : [self], updated: had ? [self] : [], removed: [] })
      },
      on: (_: "change", l: (c: Change) => void) => void heard.add(l),
      off: (_: "change", l: (c: Change) => void) => void heard.delete(l),
    },
    tab(client: number, state: Record<string, unknown>) {
      const had = states.has(client)
      states.set(client, state)
      tell({ added: had ? [] : [client], updated: had ? [client] : [], removed: [] })
    },
  }
}

const ME = { id: "u-me", name: "Sam Rivera" }
const ANN = { id: "u-ann", name: "Ann Lee" }
const VIC = { id: "u-vic", name: "Vic Reader" }
const KIM = { id: "u-kim", name: "Kim Ito" }
const users: ActiveUser[] = [ANN, VIC, KIM, ME].map((u) => ({ ...u, color: "" }))
const editor = (u: { id: string; name: string }, extra: Record<string, unknown> = {}) => ({ user: { ...u, edit: true }, ...extra })
const viewer = (u: { id: string; name: string }, extra: Record<string, unknown> = {}) => ({ user: { ...u, edit: false }, ...extra })

/** A mark drawn at this box on the screen (jsdom draws nothing, so each says where it would be). */
function placed(el: Element | null, box: { left: number; top: number; width: number; height: number }) {
  if (!el) throw new Error("no such mark")
  el.getBoundingClientRect = () => ({ ...box, right: box.left + box.width, bottom: box.top + box.height, x: box.left, y: box.top, toJSON: () => box }) as DOMRect
}

function Board({ provider, api, editable, synced = true }: { provider: unknown; api: unknown; editable: boolean; synced?: boolean }) {
  const [host, setHost] = React.useState<HTMLDivElement | null>(null)
  const bus = React.useMemo(() => boardBusOf("b1"), [])
  return (
    <div ref={setHost}>
      <div className="excalidraw" />
      {/* Ann's face in the stack, as the page's ActiveUsersBar draws it. */}
      <span data-presence-client="7 70" />
      <BoardHereNow provider={provider as never} api={api as never} boardId="b1" host={host} editable={editable} synced={synced} />
      <BoardReact hereKey={bus.key} />
      <DocBusContext.Provider value={bus}>
        <PresenceList users={users} onDone={() => {}} />
      </DocBusContext.Provider>
    </div>
  )
}

/** This tab (client 1, Sam) on a 1280 x 860 window, with Ann (an editor, tab 7) and Vic (a viewer, tab 8) on the board. */
async function open(editable: boolean) {
  const a = awarenessFor(1)
  a.tab(1, editable ? editor(ME) : viewer(ME))
  a.tab(7, editor(ANN))
  a.tab(8, viewer(VIC))
  render(<Board provider={{ awareness: a.awareness }} api={boardScene().api} editable={editable} />)
  await frames()
  placed(document.querySelector('[data-presence-client="7 70"]'), { left: 1000, top: 16, width: 24, height: 24 })
  placed(document.querySelector("[data-board-react]"), { left: 1200, top: 12, width: 32, height: 32 })
  return a
}

const risen = () =>
  Array.from(document.querySelectorAll<HTMLElement>("[data-board-reactions] > li")).map((li) => ({
    said: li.textContent?.includes("reacted") ? li.querySelector(".sr-only")?.textContent : null,
    left: li.style.left,
    top: li.style.top,
    mine: li.getAttribute("data-reaction"),
  }))
const queue = () => Array.from(document.querySelectorAll("[data-hand-row]")).map((row) => row.textContent)
/** The signals' code comes on the first one anyone sends or this person makes (components/board/boardSignalsLater). */
const signalsLive = async () => {
  await screen.findByRole("log", { name: "Reactions" })
  await frames()
}
/** The React tray's code comes on the first press (components/board/boardReactTray). */
const openTray = async () => {
  fireEvent.click(screen.getByRole("button", { name: /^React/ }))
  await screen.findByRole("group", { name: "Reactions" })
}

beforeEach(() => {
  toasts.length = 0
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1280 })
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 860 })
})
afterEach(cleanup)

describe("reactions on a board", () => {
  it("rises from under its sender's face, said once to a screen reader, and one sent before this person came never does", async () => {
    const a = awarenessFor(1)
    a.tab(1, viewer(ME))
    a.tab(7, editor(ANN, { [REACT_FIELD]: [{ id: "old", emoji: "🎉" }] }))
    render(<Board provider={{ awareness: a.awareness }} api={boardScene().api} editable={false} />)
    placed(document.querySelector('[data-presence-client="7 70"]'), { left: 1000, top: 16, width: 24, height: 24 })
    expect(risen()).toEqual([])
    // Nothing of the signals is drawn, even with their code at hand: a board nobody reacts on never loads it.
    await import("./boardSignalsPiece")
    await frames()
    expect(screen.queryByRole("log", { name: "Reactions" })).toBeNull()

    // Her first reaction brings their code, and still rises, though it came before the code did.
    a.tab(7, editor(ANN, { [REACT_FIELD]: [{ id: "old", emoji: "🎉" }, { id: "r1", emoji: "❤️" }] }))
    await signalsLive()
    // Under her face (its middle at x 1012), starting low enough to rise to just under it.
    expect(risen()).toEqual([{ said: "Ann Lee reacted: Heart", left: "1012px", top: "136px", mine: "" }])
    expect(screen.getByRole("log", { name: "Reactions" }).getAttribute("aria-live")).toBe("polite")

    // Her other tab is her too; a mark that isn't in the set never shows.
    a.tab(70, editor(ANN, { [REACT_FIELD]: [{ id: "r2", emoji: "<b>hi</b>" }] }))
    expect(risen()).toHaveLength(1)
  })

  it("mine rises from my React button, closes the tray and travels on my awareness as my last few", async () => {
    const a = await open(false)
    await openTray()
    // My first reaction runs once the signals' code is in.
    fireEvent.click(screen.getByRole("button", { name: "Thumbs up" }))
    await signalsLive()
    expect(risen()).toEqual([{ said: "You reacted: Thumbs up", left: "1200px", top: "140px", mine: "mine" }])
    expect(a.states.get(1)?.[REACT_FIELD]).toEqual([{ id: expect.any(String), emoji: "👍" }])
    expect(screen.queryByRole("button", { name: "Thumbs up" })).toBeNull()
  })

  it("holds the button until the board's signals are live", () => {
    render(<BoardReact hereKey="board:none" />)
    expect((screen.getByRole("button", { name: "React or raise your hand" }) as HTMLButtonElement).disabled).toBe(true)
  })
})

describe("raised hands on a board", () => {
  it("an editor hears of each new hand with Lower, Here now queues them first raised first, and Lower reaches that tab", async () => {
    const a = await open(true)
    a.tab(8, viewer(VIC, { [HAND_FIELD]: { id: "h8", raisedAt: 300 } }))
    a.tab(9, viewer(KIM, { [HAND_FIELD]: { id: "h9", raisedAt: 100 } }))
    await signalsLive()
    expect(toasts.map((t) => t.title)).toEqual(["Vic Reader raised a hand", "Kim Ito raised a hand"])
    expect(queue()).toEqual(["1✋Kim ItoLower", "2✋Vic ReaderLower"])

    // Lower from the toast: this tab says so to Vic's tab, by its number.
    const action = toasts[0].action as unknown as React.ReactElement<{ altText: string; onClick(): void; children: string }>
    expect([action.props.altText, action.props.children]).toEqual(["Lower Vic Reader's hand", "Lower"])
    act(() => action.props.onClick())
    expect(a.states.get(1)?.[LOWER_FIELD]).toEqual([{ id: expect.any(String), client: 8 }])
    // ...and from the queue, as a second word beside the first.
    fireEvent.click(screen.getByRole("button", { name: "Lower Kim Ito's hand" }))
    expect((a.states.get(1)?.[LOWER_FIELD] as { client: number }[]).map((l) => l.client)).toEqual([8, 9])
  })

  it("a viewer hears of no hand and lowers none, raises their own, and only an editor's word lowers it", async () => {
    const a = await open(false)
    a.tab(8, viewer(VIC, { [HAND_FIELD]: { id: "h8", raisedAt: 300 } }))
    await signalsLive()
    expect(toasts).toEqual([])
    expect(queue()).toEqual(["1✋Vic Reader"])

    await openTray()
    fireEvent.click(screen.getByRole("button", { name: "Raise hand" }))
    expect(a.states.get(1)?.[HAND_FIELD]).toEqual({ id: expect.any(String), raisedAt: expect.any(Number) })
    await frames()
    expect(screen.getByRole("button", { name: "React, or lower your hand" })).toBeTruthy()

    // Vic, a viewer, claims to lower it: nothing moves.
    a.tab(8, viewer(VIC, { [LOWER_FIELD]: [{ id: "forged", client: 1 }] }))
    expect(a.states.get(1)?.[HAND_FIELD]).not.toBeNull()
    // Ann, an editor, lowers another tab's hand: still nothing here.
    a.tab(7, editor(ANN, { [LOWER_FIELD]: [{ id: "l0", client: 8 }] }))
    expect(a.states.get(1)?.[HAND_FIELD]).not.toBeNull()
    // Ann lowers this tab's: it goes, and this person is told who lowered it.
    a.tab(7, editor(ANN, { [LOWER_FIELD]: [{ id: "l0", client: 8 }, { id: "l1", client: 1 }] }))
    expect(a.states.get(1)?.[HAND_FIELD]).toBeNull()
    expect(toasts.map((t) => t.title)).toEqual(["Ann Lee lowered your hand"])
    expect(screen.getByRole("button", { name: "React or raise your hand" })).toBeTruthy()
  })

  it("lowers my own hand from Here now's queue, as You", async () => {
    const a = await open(false)
    await openTray()
    // My first hand runs once the signals' code is in.
    fireEvent.click(screen.getByRole("button", { name: "Raise hand" }))
    await signalsLive()
    expect(queue()).toEqual(["1✋YouLower"])
    fireEvent.click(screen.getByRole("button", { name: "Lower your hand" }))
    expect(a.states.get(1)?.[HAND_FIELD]).toBeNull()
  })
})

describe("what was on the board as it opened", () => {
  // Here now is drawn on the connection, before the first sync brings who is already on the board (CODE-REVIEW-LOG
  // row 2308): what arrives before that sync was there as this person came, so none of it is news.
  it("arrives before the first sync and never shows, though the board was drawn first; what comes after it does", async () => {
    const a = awarenessFor(1)
    const api = boardScene().api
    a.tab(1, editor(ME))
    const view = render(<Board provider={{ awareness: a.awareness }} api={api} editable synced={false} />)
    placed(document.querySelector('[data-presence-client="7 70"]'), { left: 1000, top: 16, width: 24, height: 24 })
    a.tab(7, editor(ANN, { [REACT_FIELD]: [{ id: "old", emoji: "🎉" }] }))
    a.tab(8, viewer(VIC, { [HAND_FIELD]: { id: "h-old", raisedAt: 100 } }))
    view.rerender(<Board provider={{ awareness: a.awareness }} api={api} editable synced />)
    await import("./boardSignalsPiece")
    await frames()
    expect(screen.queryByRole("log", { name: "Reactions" }), "the signals' code loads for what was already there").toBeNull()
    expect(risen()).toEqual([])
    expect(toasts).toEqual([])

    a.tab(7, editor(ANN, { [REACT_FIELD]: [{ id: "old", emoji: "🎉" }, { id: "r1", emoji: "❤️" }] }))
    await signalsLive()
    expect(risen().map((r) => r.said)).toEqual(["Ann Lee reacted: Heart"])
    a.tab(8, viewer(VIC, { [HAND_FIELD]: { id: "h-new", raisedAt: 200 } }))
    expect(toasts.map((t) => t.title)).toEqual(["Vic Reader raised a hand"])
  })
})
