import { afterEach, describe, expect, it, vi } from "vitest"
import { pinTestClock } from "@/lib/testing/testClock"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import type { RecordingInfoInterface } from "@/types/recording"

vi.mock("@/hooks/useFetch", () => ({
  useFetchOnlyOnce: () => ({ data: undefined }),
  useFetch: () => ({ data: undefined, isLoading: false, isError: undefined, mutate: () => {} }),
}))
vi.mock("react-redux", async (actual) => ({ ...(await actual<typeof import("react-redux")>()), useDispatch: () => () => {} }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))

const { RecordingListRecording, callLength, recordingPlace, recordingHueKey } = await import("@/components/recording/recordingListRecording")
const { recordingDayGroup } = await import("@/components/recording/RecordingsView")
const { hueFor } = await import("@/lib/campHue")
const { dateRangeLabel } = await import("@/components/dateRangePicker/dateRangeField")

afterEach(cleanup)
// Today is pinned (app/testClock.test.ts): a day in this year is written without its year, and these are 2026's.
pinTestClock()

const person = (uuid: string, name: string) => ({ user_uuid: uuid, user_name: name, user_full_name: name }) as never
const rec = (over: Partial<RecordingInfoInterface> = {}): RecordingInfoInterface =>
  ({
    recording_egress_id: "eg1",
    recording_stared_at: "2026-10-10T10:00:00",
    recording_ended_at: "2026-10-10T10:12:00",
    recording_duration: 734,
    recording_obj_key: "k",
    recording_transcript: [],
    recording_size: 12.3 * 1024 * 1024,
    recording_started_by: person("u1", "Sam Rivera"),
    recording_channel: { ch_uuid: "c1", ch_name: "engineering" } as never,
    recording_dm: undefined as never,
    ...over,
  }) as RecordingInfoInterface

/**
 * The recordings page was the one screen left from before the redesign (QA
 * backlog, Home, search, inbox, calls). A recording is a row of the app's
 * lists now, in its place's colour, with its words in the app's style.
 */
describe("a recorded call", () => {
  it("says how long it ran in words", () => {
    expect(callLength(45)).toBe("45 s")
    expect(callLength(734)).toBe("12 min")
    expect(callLength(3900)).toBe("1 h 5 min")
    expect(callLength(7200)).toBe("2 h")
  })

  it("names its place: the channel without a space after #, the person, or the group's people", () => {
    expect(recordingPlace(rec())).toBe("#engineering")
    const dm = { dm_participants: [person("me", "Sam Rivera"), person("u2", "Maya Chen")], dm_grouping_id: "g" } as never
    expect(recordingPlace(rec({ recording_channel: undefined as never, recording_dm: dm }), "me")).toBe("Maya Chen")
    const grp = { dm_participants: [person("me", "Sam"), person("u2", "Maya Chen"), person("u3", "Jonas Weber")], dm_grouping_id: "g" } as never
    expect(recordingPlace(rec({ recording_channel: undefined as never, recording_dm: grp }), "me")).toBe("Maya Chen, Jonas Weber")
  })

  it("is a HubRow that plays it, with who started it and how big on one quiet line", () => {
    const onOpen = vi.fn()
    render(<RecordingListRecording recordingInfo={rec()} currentUserId="me" onOpen={onOpen} />)
    const row = screen.getByRole("button", { name: "Play the recording, #engineering, 10 Oct, 10:00\u00a0AM" })
    fireEvent.click(row)
    expect(onOpen).toHaveBeenCalled()
    expect(row.textContent).toContain("Started by Sam Rivera · 12.3 MB")
    expect(row.getAttribute("data-density")).toBe("two-line")
    expect(row.outerHTML).not.toMatch(/bg-primary|font-bold|shadow-sm/)
  })

  it("leads with a thumbnail in the place's hue, its length in the corner", () => {
    const { container } = render(<RecordingListRecording recordingInfo={rec()} currentUserId="me" />)
    const thumb = container.querySelector("[data-recording-thumb]")!
    expect(thumb.getAttribute("data-hue")).toBe(hueFor(recordingHueKey(rec(), "me")))
    expect(thumb.getAttribute("data-hue")).toBe(hueFor("c1"))
    expect(container.querySelector("[data-duration-badge]")?.textContent).toBe("12:14")
    const { container: none } = render(<RecordingListRecording recordingInfo={rec({ recording_duration: 0 })} currentUserId="me" />)
    expect(none.querySelector("[data-duration-badge]")).toBeNull()
  })

  // V-32. One that captured nothing ("empty") or broke ("failed") has nothing to play: its row says which, its
  // thumbnail shows no play triangle, and it offers See why in place of Play. It still opens the player, which
  // says why, and it can be deleted.
  it("says when a recording has nothing to play, and offers See why, not Play", () => {
    for (const [status, words] of [["empty", "Nothing recorded"], ["failed", "Couldn't be saved"]] as const) {
      const onOpen = vi.fn()
      const { container, unmount } = render(
        <RecordingListRecording recordingInfo={rec({ recording_status: status, recording_duration: 0, recording_size: 0 } as never)} currentUserId="me" onOpen={onOpen} onDelete={() => {}} />,
      )
      const row = screen.getByRole("button", { name: `Open the recording, #engineering, 10 Oct, 10:00\u00a0AM, ${words}` })
      expect(row.textContent).toContain(`${words} · Started by Sam Rivera`)
      expect(container.querySelector("[data-thumb-play]")).toBeNull()
      expect(container.querySelector(`[data-thumb-nothing="${status}"]`)).not.toBeNull()
      expect(screen.queryByRole("button", { name: "Play" })).toBeNull()
      expect(screen.getByRole("button", { name: "Delete recording" })).toBeTruthy()
      fireEvent.click(screen.getByRole("button", { name: "See why" }))
      expect(onOpen).toHaveBeenCalledTimes(1)
      fireEvent.click(row)
      expect(onOpen).toHaveBeenCalledTimes(2)
      unmount()
    }
    render(<RecordingListRecording recordingInfo={rec({ recording_status: "ready" } as never)} currentUserId="me" onOpen={() => {}} />)
    expect(screen.getByRole("button", { name: "Play" })).toBeTruthy()
  })

  it("tags a recording that has a transcript", () => {
    render(<RecordingListRecording recordingInfo={rec({ recording_transcript: [{}] as never })} currentUserId="me" />)
    expect(screen.getByText("Transcript")).toBeTruthy()
  })

  it("groups by day", () => {
    const now = new Date(2026, 9, 11, 12)
    expect(recordingDayGroup(new Date(2026, 9, 11, 9).toISOString(), now)).toBe("Today")
    expect(recordingDayGroup(new Date(2026, 9, 10, 9).toISOString(), now)).toBe("Yesterday")
    expect(recordingDayGroup(new Date(2026, 9, 7, 9).toISOString(), now)).toBe("Earlier this week")
    expect(recordingDayGroup(new Date(2026, 8, 1).toISOString(), now)).toBe("Older")
  })
})

describe("the recordings' date range", () => {
  it("reads as the app writes days, with the year only when it isn't this one", () => {
    const now = new Date(2026, 9, 10)
    expect(dateRangeLabel({ from: new Date(2026, 8, 10), to: new Date(2026, 9, 10) }, now)).toBe("10 Sep to 10 Oct")
    expect(dateRangeLabel({ from: new Date(2025, 11, 20), to: new Date(2026, 0, 5) }, now)).toBe("20 Dec 2025 to 5 Jan")
    expect(dateRangeLabel(undefined, now)).toBe("Pick dates")
  })
})

describe("the one recordings UI", () => {
  const code = (f: string) =>
    readFileSync(resolve(__dirname, "../..", f), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "")
  it.each([
    "app/app/recordings/page.tsx",
    "components/channel/channelRecording.tsx",
    "components/chat/ChatRecording.tsx",
    "components/chat/GroupChatRecording.tsx",
  ])("%s draws it, with no frame of its own", (f) => {
    const src = code(f)
    expect(src).toMatch(/<RecordingsView/)
    expect(src).not.toMatch(/statusColors|SkeletonRows|StatePlaceholder|VirtualInfiniteScroll|md:w-\[45vw\]/)
  })
  it("is a title with its range, the lists' column, a skeleton in the rows' frame and states where Activity's are", () => {
    const src = code("components/recording/RecordingsView.tsx")
    expect(src).toMatch(/<PageHeader title="Recordings" actions=\{rangeField\}>/)
    expect(src).toMatch(/<PageContainer className="flex min-h-0 flex-1 flex-col">/)
    expect(src).toMatch(/illustration=\{<SpotRecording \/>\}/)
    // Start-aligned in the column, as the hub's empties are: the hub's own
    // states, not the shared EmptyState, which centred itself in its box.
    expect(src).toMatch(/className="flex justify-start pt-4 md:pt-12"/)
    expect(src).toMatch(/<HubEmpty\b/)
    expect(src).toMatch(/<HubError\b/)
    expect(src).not.toMatch(/<EmptyState\b|<ErrorState\b/)
    expect(src).toMatch(/Show the last 90 days/)
    expect(src).toMatch(/data-lead="40"/)
    expect(src).not.toMatch(/Global Meeting History|Gathering your recordings/)
  })
})

// QA F-30: the range button sat at the right edge of the lists' 880px column,
// two thirds of the way across a wide sheet.
describe("the recordings page's header", () => {
  it("spans the sheet, the range on its right edge, over the lists' column", async () => {
    const { RecordingsView } = await import("@/components/recording/RecordingsView")
    const { container } = render(
      <RecordingsView listUrl="/recordings" playerUrls={() => ({ media: "", transcript: "" })} subtitle="Calls recorded in your channels and conversations." />,
    )
    const [head, list] = Array.from(container.querySelectorAll("[data-recordings-view] > div"))
    expect(head.querySelector("header")).not.toBeNull()
    expect(head.className).not.toContain("max-w-[880px]")
    expect(list.className).toContain("max-w-[880px]")
  })
})
