// CR-330 N7: a recap's "Play recording" opens the one player by the conversation's own routes, the ones
// lib/calls/playerUrls builds for the recordings list and boards (a DM's by the other person).
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render } from "@testing-library/react"
import { Provider } from "react-redux"
import { configureStore, type UnknownAction } from "@reduxjs/toolkit"
import type { ReactNode } from "react"
import type { NodeViewProps } from "@tiptap/react"

vi.mock("@tiptap/react", () => ({ NodeViewWrapper: ({ children }: { children: ReactNode }) => <div>{children}</div> }))
vi.mock("@/hooks/useFetch", () => ({ useFetch: (url: string) => ({ data: url ? { data: { user_uuid: "me" } } : undefined }) }))
vi.mock("@/components/minimal-tiptap/guestReader", () => ({ useGuestReader: () => false }))

import { openUI } from "@/store/slice/uiSlice"
import { playerUrls } from "@/lib/calls/playerUrls"
import { RecordingEmbedView } from "./recording-embed-view"

const seen: UnknownAction[] = []
const play = (attrs: Record<string, string>) => {
  cleanup()
  const store = configureStore({ reducer: { ui: (st: Record<string, unknown> = {}, a: UnknownAction) => (seen.push(a), st) } })
  const view = render(
    <Provider store={store}>
      <RecordingEmbedView {...({ node: { attrs: { egress: "EG_1", ...attrs } } } as unknown as NodeViewProps)} />
    </Provider>,
  )
  fireEvent.click(view.getByRole("button", { name: /Play recording/ }))
  return seen.filter((a) => openUI.match(a)).map((a) => (a.payload as { data: Record<string, unknown> }).data)
}

afterEach(() => {
  cleanup()
  seen.length = 0
})

describe("a recap's Play recording", () => {
  it("opens a channel's and a group's call by their routes", () => {
    const ch = playerUrls({ kind: "channel", id: "c1" })
    expect(play({ kind: "channel", sid: "c1" })).toEqual([expect.objectContaining({ egressId: "EG_1", mediaGetUrl: ch.media, transcriptGetUrl: ch.transcript })])
    seen.length = 0
    const grp = playerUrls({ kind: "group", id: "g1" })
    expect(play({ kind: "group", sid: "g1" })).toEqual([expect.objectContaining({ mediaGetUrl: grp.media, transcriptGetUrl: grp.transcript })])
  })

  it("opens a DM's call by the other person, whichever side they are on", () => {
    const dm = playerUrls({ kind: "dm", id: "peer" })
    expect(play({ kind: "dm", u1: "me", u2: "peer" })).toEqual([expect.objectContaining({ mediaGetUrl: dm.media, transcriptGetUrl: dm.transcript })])
    seen.length = 0
    expect(play({ kind: "dm", u1: "peer", u2: "me" })).toEqual([expect.objectContaining({ mediaGetUrl: dm.media })])
  })

  it("opens nothing without its conversation", () => {
    expect(play({ kind: "channel" })).toEqual([])
    expect(play({ kind: "meeting", sid: "m1" })).toEqual([])
  })
})
