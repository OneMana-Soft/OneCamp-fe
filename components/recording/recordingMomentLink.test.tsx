// zoom-13: a search hit's link opens a conversation's recordings with ?play=<recording>&at=<ms>[&media=0]. The
// page opens the one player once, at that moment, by the same open its rows use, then drops the moment from
// its address so closing the player doesn't open it again.
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render } from "@testing-library/react"
import { Provider } from "react-redux"
import { configureStore, type UnknownAction } from "@reduxjs/toolkit"

const nav = vi.hoisted(() => ({ query: "", replace: vi.fn() }))
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(nav.query),
  useRouter: () => ({ replace: nav.replace, push: vi.fn() }),
  usePathname: () => "/app/channel/c1/recording",
}))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isDesktop: true, isMobile: false }) }))
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => ({ data: undefined, isLoading: false, isError: undefined, mutate: vi.fn() }) }))

import uiSlice, { openUI } from "@/store/slice/uiSlice"
import { playerUrls } from "@/lib/calls/playerUrls"
import type { ConversationCallRef } from "@/lib/calls/boardCall"
import { RecordingsView } from "./RecordingsView"

const seen: UnknownAction[] = []
const show = (call: ConversationCallRef = { kind: "channel", id: "c1" }) => {
  const store = configureStore({ reducer: { ui: (st: Record<string, unknown> = {}, a: UnknownAction) => (seen.push(a), st) } })
  const tree = () => (
    <Provider store={store}>
      <RecordingsView listUrl="/recordings/c1" call={call} subtitle="Calls recorded here." />
    </Provider>
  )
  const r = render(tree())
  return { rerender: () => r.rerender(tree()) }
}
const opened = () => seen.filter((a) => openUI.match(a)).map((a) => a.payload as { key: string; data: Record<string, unknown> })

afterEach(() => {
  cleanup()
  seen.length = 0
  nav.query = ""
  nav.replace.mockClear()
})

describe("a recordings page opened at a call's moment", () => {
  it("opens the one player once, at that moment, by the conversation's own routes", () => {
    nav.query = "play=EG_1&at=125400"
    const { rerender } = show()
    rerender()
    const urls = playerUrls({ kind: "channel", id: "c1" })
    expect(opened()).toHaveLength(1)
    expect(opened()[0]).toMatchObject({ key: "recordingPlayer", data: { egressId: "EG_1", mediaGetUrl: urls.media, transcriptGetUrl: urls.transcript, startAtMs: 125_400 } })
  })

  it("then drops the moment from its address, the page staying where it is", () => {
    nav.query = "play=EG_1&at=125400&media=0"
    show()
    expect(nav.replace).toHaveBeenCalledTimes(1)
    expect(nav.replace).toHaveBeenCalledWith("/app/channel/c1/recording", { scroll: false })
  })

  it("names no file it doesn't know when the link opens before the list answers (CR-330 F2)", () => {
    nav.query = "play=EG_1&at=125400"
    show()
    const data = opened()[0]?.data
    // The player names it from the transcript's answer; a guessed "Recording.mp4" would stand in its title.
    expect(data?.fileName).toBe("")
    expect(data?.recordedAt).toBe("")
  })

  it("asks for no picture of a call nobody recorded, reading it as its words", () => {
    nav.query = "play=CALL_9&at=9800&media=0"
    show()
    const data = opened()[0]?.data
    expect(data).toMatchObject({ egressId: "CALL_9", status: "transcript_only", startAtMs: 9800 })
    expect(data?.mediaGetUrl).toBeUndefined()
  })

  it("opens a moment that isn't a time at the start", () => {
    nav.query = "play=EG_1&at=-3"
    show()
    expect(opened()[0]?.data.startAtMs).toBe(0)
  })

  it("opens nothing with no recording to play", () => {
    nav.query = "at=9800"
    show()
    expect(opened()).toHaveLength(0)
    expect(nav.replace).not.toHaveBeenCalled()
  })

  it("reads a DM's call by the other person's routes", () => {
    nav.query = "play=EG_2&at=0"
    show({ kind: "dm", id: "u2" })
    expect(opened()[0]?.data.transcriptGetUrl).toBe(playerUrls({ kind: "dm", id: "u2" }).transcript)
  })
})

describe("the place's Delete reaches a player its link opened before the place's rights answered (zoom-05 F1)", () => {
  const live = (onDelete?: (egressId: string) => Promise<void>) => {
    const store = configureStore({ reducer: { ui: uiSlice.reducer } })
    const tree = (del?: typeof onDelete) => (
      <Provider store={store}>
        <RecordingsView listUrl="/recordings/c1" call={{ kind: "channel", id: "c1" }} subtitle="Calls recorded here." onDelete={del} />
      </Provider>
    )
    const r = render(tree(onDelete))
    return { store, rerender: (del?: typeof onDelete) => r.rerender(tree(del)) }
  }
  const player = (store: ReturnType<typeof live>["store"]) => store.getState().ui.recordingPlayer as { isOpen: boolean; data: Record<string, unknown> | null }

  it("a channel's admin: the link opens first, the admin flag answers next, and the open player gives the place's Delete", () => {
    nav.query = "play=EG_1&at=0&media=0"
    const { store, rerender } = live(undefined)
    expect(player(store).data?.mayDelete).toBe(false)
    rerender(async () => undefined)
    expect(player(store)).toMatchObject({ isOpen: true, data: { egressId: "EG_1", mayDelete: true, startAtMs: 0 } })
  })

  it("a player this page didn't open, or one closed, is left as it is", () => {
    const { store, rerender } = live(undefined)
    act(() => {
      store.dispatch(openUI({ key: "recordingPlayer", data: { egressId: "OTHER", mayDelete: false } }))
    })
    rerender(async () => undefined)
    expect(player(store).data?.mayDelete).toBe(false)
  })
})
