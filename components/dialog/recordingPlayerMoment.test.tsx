// zoom-13: a search hit opens the one player at the moment its line was said. A recorded call's moment goes
// to the playback (which seeks once, recordingPlayback.test); a call nobody recorded is read as its words
// alone, with no picture asked for, its line at the moment the active one and in view. Its own mocks: the
// lines' list is the shared virtual list, here drawn whole so its scroll target can be read.
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, within } from "@testing-library/react"
import { Provider } from "react-redux"
import { configureStore } from "@reduxjs/toolkit"
import { useEffect, type ReactNode } from "react"

const s = vi.hoisted(() => ({
  transcript: undefined as unknown, denied: 0 as number, paths: [] as string[], startAt: [] as unknown[], scrolledTo: [] as unknown[],
  // A transcript of several pages (by pageIndex), the pages asked for in order, and a list whose end is in view.
  pages: undefined as unknown[] | undefined, asked: [] as number[], endInView: false,
}))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false }) }))
vi.mock("@/hooks/useFetch", async () => {
  const { useEffect: useAfter, useState } = await import("react")
  return {
  // Who is looking: nobody known, so no line offers a correction here (zoom-05's own tests do).
  useFetchOnlyOnce: () => ({ data: undefined }),
  // A new address loads for a render before its answer comes, as the real fetch does.
  useFetch: (url: string) => {
    const [answered, setAnswered] = useState("")
    useAfter(() => setAnswered(url), [url])
    const page = Number(/pageIndex=(\d+)/.exec(url)?.[1] ?? 0)
    if (url && s.asked.at(-1) !== page) s.asked.push(page)
    const ready = answered === url
    return {
    data: url && ready && !s.denied ? (s.pages ? s.pages[page] : s.transcript) : undefined,
    isLoading: !!url && !ready && !s.denied,
    isError: url && s.denied ? { response: { status: s.denied } } : undefined,
    mutate: vi.fn(),
    }
  },
  }
})
vi.mock("@/components/dialog/useRecordingPlayback", async (real) => ({
  ...(await real<typeof import("@/components/dialog/useRecordingPlayback")>()),
  useRecordingPlayback: (path: string, _open: boolean, startAt?: number) => {
    s.paths.push(path)
    s.startAt.push(startAt)
    return {
      media: path ? { status: "ready", url: "https://media.test/r.mp4" } : null,
      loadError: false,
      playbackFailed: false,
      videoRef: { current: null },
      videoProps: {},
      seekTo: vi.fn(),
      freshUrl: vi.fn(),
      retry: vi.fn(),
      reload: vi.fn(),
    }
  },
}))
vi.mock("@/components/list/virtualInfiniteScroll", () => ({
  VirtualInfiniteScroll: ({ items, renderItem, scrollToIndex, onLoadMore, hasMore }: { items: unknown[]; renderItem: (item: unknown, i: number) => ReactNode; scrollToIndex?: number; onLoadMore: () => void; hasMore: boolean }) => {
    s.scrolledTo.push(scrollToIndex)
    // A short list's end is always in view: it asks for more on every commit it has more, as a scroll would.
    useEffect(() => {
      if (s.endInView && hasMore) onLoadMore()
    })
    return <div>{items.map((item, i) => <div key={i}>{renderItem(item, i)}</div>)}</div>
  },
}))

import { format } from "date-fns"
import { recordingFileName } from "@/lib/calls/recordingFileName"
import { pinTestClock } from "@/lib/testing/testClock"
import { RecordingPlayerDialog } from "./RecordingPlayerDialog"

pinTestClock()

const words = (offsets: number[]) => ({
  data: {
    recording_transcript: offsets.map((ms, i) => ({ transcript_from: { user_full_name: "Maya Rao" }, transcript_text: `line ${i}`, transcript_timestamp: 0, transcript_offset_ms: ms })),
    transcript_count: offsets.length,
  },
  pageCount: 1,
})
const open = (data: Record<string, unknown>) =>
  render(
    <Provider store={configureStore({ reducer: { ui: (st = { recordingPlayer: { isOpen: true, data } }) => st } })}>
      <RecordingPlayerDialog />
    </Provider>,
  )
const RECORDED = { egressId: "EG_1", mediaGetUrl: "/ch/getRecordingURL/c1", transcriptGetUrl: "/ch/getTranscript/c1", fileName: "Recording.mp4", startAtMs: 125_400 }
const UNRECORDED = { egressId: "CALL_9", transcriptGetUrl: "/ch/getTranscript/c1", status: "transcript_only", fileName: "Recording.mp4", startAtMs: 9_800 }
const active = () => [...document.querySelectorAll('[data-transcript] [aria-current="true"]')]

afterEach(() => {
  cleanup()
  s.transcript = undefined
  s.denied = 0
  s.paths.length = 0
  s.startAt.length = 0
  s.scrolledTo.length = 0
  s.pages = undefined
  s.asked.length = 0
  s.endInView = false
})

describe("the player at a call's moment", () => {
  it("hands a recorded call's moment to its playback, in seconds", () => {
    s.transcript = words([0, 4000])
    open(RECORDED)
    expect(s.paths.at(-1)).toBe("/ch/getRecordingURL/c1/EG_1")
    expect(s.startAt.at(-1)).toBe(125.4)
  })

  it("reads a call nobody recorded as its words alone, asking for no picture", () => {
    s.transcript = words([0, 4000, 9500, 20000])
    open(UNRECORDED)
    expect(s.paths.every((p) => p === "")).toBe(true)
    expect(document.querySelector("[data-transcript]")?.textContent).toContain("this call wasn't recorded")
  })

  it("makes the line at or before the moment the active one, and scrolls it into view", () => {
    s.transcript = words([0, 4000, 9500, 20000])
    open(UNRECORDED)
    expect(active().map((l) => l.textContent)).toEqual([expect.stringContaining("line 2")])
    expect(s.scrolledTo.at(-1)).toBe(2)
  })

  it("marks no line and scrolls nowhere with no moment", () => {
    s.transcript = words([0, 4000])
    open({ ...UNRECORDED, startAtMs: undefined })
    expect(active()).toHaveLength(0)
    expect(s.scrolledTo.at(-1)).toBeUndefined()
  })

  // CR-330 F2: a call this person can't see (403), or that is gone (404), is said as the house's load
  // failure says it, with no Try again, which can never fix either; a failure on the way still offers it.
  it.each([
    [403, "You can't see this call"],
    [404, "This call doesn't exist or was deleted"],
  ])("says why there are no words when the transcript's route answers %i, offers no Try again, and shows no line", (status, says) => {
    s.denied = status
    s.transcript = words([0, 4000])
    open(UNRECORDED)
    const panel = document.querySelector("[data-transcript]") as HTMLElement
    expect(panel.textContent).toContain(says)
    expect(panel.textContent).not.toContain("Couldn't load")
    // Its header says nothing about a recording: "wasn't recorded" came from the link, not from the call (CR-330 F2).
    expect(panel.textContent).not.toMatch(/record/i)
    expect(within(panel).queryByRole("button", { name: /try again/i })).toBeNull()
    expect(document.body.textContent).not.toContain("line 0")
  })

  it("says the transcript couldn't load, with Try again, when its route fails on the way", () => {
    s.denied = 500
    s.transcript = words([0, 4000])
    open(UNRECORDED)
    const panel = document.querySelector("[data-transcript]") as HTMLElement
    expect(panel.querySelector('[role="alert"]')?.textContent).toContain("Couldn't load the transcript")
    expect(within(panel).getByRole("button", { name: /try again/i })).toBeTruthy()
    expect(document.body.textContent).not.toContain("line 0")
  })
})

// CR-330 F2: a link opens the player before the recordings list answers, so no row gives it a name.
describe("the player's title before its row is known", () => {
  const STARTED = "2026-11-12T05:44:00Z"
  const title = () => document.querySelector('[role="dialog"] h2')?.textContent ?? ""
  const answered = (offsets: number[]) => {
    const w = words(offsets)
    return { ...w, data: { ...w.data, recording_stared_at: STARTED } }
  }

  it("names a recording by its start from the transcript's answer, never a bare Recording.mp4", () => {
    s.transcript = answered([0, 4000])
    open({ ...RECORDED, fileName: "" })
    expect(title()).toBe(recordingFileName(STARTED))
    expect(title()).not.toBe("Recording.mp4")
  })

  it("names no file for a call nobody recorded: it is the call on its day", () => {
    s.transcript = answered([0, 4000])
    open(UNRECORDED)
    expect(title()).not.toContain(".mp4")
    expect(title()).toBe(`Call on ${format(new Date(STARTED), "d MMM yyyy")}`)
  })
})

// CR-330 N6: one place reads the transcript's next page. The moment's chase and the list's load-more both did,
// so the chase read one page too many (it saw the old list for a render) and, in the same tick, both added one.
describe("the transcript's pages, read toward a moment", () => {
  const page = (offsets: number[], pageCount: number) => ({ ...words(offsets), pageCount })

  it("reads on only to the page the moment is in: no page past it", () => {
    s.pages = [page([0, 1000], 3), page([2000, 3000, 9000], 3), page([20000], 3)]
    open({ ...UNRECORDED, startAtMs: 2500 })
    expect(s.asked).toEqual([0, 1])
  })

  it("asks each page once, in order, when the chase and the list's load-more fire in the same tick", () => {
    s.endInView = true
    s.pages = [page([0, 1000], 3), page([2000, 3000], 3), page([20000], 3)]
    open({ ...UNRECORDED, startAtMs: 25_000 })
    expect(s.asked).toEqual([0, 1, 2])
  })
})
