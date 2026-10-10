import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import type { RecordingInfoInterface } from "@/types/recording"

vi.mock("@/hooks/useFetch", () => ({ useFetchOnlyOnce: () => ({ data: undefined }) }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))

const { RecordingListRecording, callLength, recordingPlace } = await import("@/components/recording/recordingListRecording")
const { dateRangeLabel } = await import("@/components/dateRangePicker/dateRangeField")

afterEach(cleanup)

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

  it("is a button that plays it, with who, how long and how big on one quiet line", () => {
    const onOpen = vi.fn()
    render(<RecordingListRecording recordingInfo={rec()} currentUserId="me" onOpen={onOpen} />)
    const row = screen.getByRole("button", { name: "Play the recording, #engineering, 10 Oct, 10:00 AM" })
    fireEvent.click(row)
    expect(onOpen).toHaveBeenCalled()
    expect(row.textContent).toContain("Started by Sam Rivera · 12 min · 12.3 MB")
    // No accent, no card: the hover is the lists' neutral step.
    expect(row.className).toContain("hover:bg-highlight")
    expect(row.outerHTML).not.toMatch(/bg-primary|font-bold|rounded-full|shadow-sm/)
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

describe("the recordings page", () => {
  // The code, not its comments (which say what it replaced).
  const src = readFileSync(resolve(__dirname, "../../app/app/recordings/page.tsx"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
  it("is the app's page: a title with its range, the lists' column, and its states where Activity's are", () => {
    expect(src).toMatch(/<PageHeader title="Recordings" actions=\{range\}>/)
    expect(src).toMatch(/<PageContainer className="flex min-h-0 flex-1 flex-col">/)
    expect(src).toMatch(/illustration=\{<SpotCalendar \/>\}/)
    expect(src).toMatch(/className="flex justify-center pt-4 md:pt-10"/)
    expect(src).not.toMatch(/Global Meeting History|statusColors|Gathering your recordings/)
  })
})
