import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

// Live Entity Chips (docs C1, §4 #21): the registry, the store's reads, the
// live topic and the chip's states. The server's read and the broker are
// stood in for: readEntities answers what each test says, and useMqttTopic
// hands the test the handler a chip listens with.

const reads: Array<Array<{ kind: string; id: string }>> = []
let answer: (refs: Array<{ kind: string; id: string }>) => Promise<unknown[]> = async () => []
vi.mock("@/services/connectedService", () => ({
  MAX_REFS: 100,
  readEntities: (refs: Array<{ kind: string; id: string }>) => {
    reads.push(refs)
    return answer(refs)
  },
}))

const topics = new Map<string, (raw: string) => void>()
vi.mock("@/hooks/useMqttTopic", () => ({
  useMqttTopic: ({ topic, onMessage }: { topic: string; onMessage?: (raw: string) => void }) => {
    if (topic && onMessage) topics.set(topic, onMessage)
  },
}))
const push = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }))
vi.mock("@/components/message/chatFace", () => ({ ChatFace: () => null }))

import { MqttMessageType } from "@/services/mqttService"
import { EntityChip } from "@/components/liveEntity/EntityChip"
import { registerEntityKind, useLiveEntity } from "@/lib/liveEntity"
import { readNow, resetLiveEntities, snapshot, watch } from "./store"
import { dateLabel } from "./dates"
import { dayKey } from "@/lib/utils/date/days"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()

const TASK = "7a5c0000-0000-4000-8000-000000000002"
const OTHER = "7a5c0000-0000-4000-8000-000000000003"
const DOC = "0d0c0000-0000-4000-8000-000000000001"
const TOPIC = "message/PROJECT"

const task = (over: Record<string, unknown> = {}) => ({
  kind: "task",
  id: TASK,
  access: "ok",
  topic: TOPIC,
  data: { name: "Write the launch post", status: "inProgress", status_name: "In progress", done: false, can_edit: true, ...over },
})

/** Lets the store's batch go out and its answer land. */
async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0))
    await Promise.resolve()
  })
}

beforeEach(() => {
  reads.length = 0
  topics.clear()
  push.mockReset()
  resetLiveEntities()
})
afterEach(cleanup)

describe("Live Entity Chips", () => {
  it("reads every chip on the page together, once each, whatever its kind", async () => {
    answer = async (refs) => refs.map((r) => (r.kind === "task" ? { ...task({ name: r.id }), id: r.id } : { kind: r.kind, id: r.id, access: "ok", data: { title: "Plan" } }))
    render(
      <>
        <EntityChip kind="task" id={TASK} />
        <EntityChip kind="task" id={TASK} />
        <EntityChip kind="task" id={OTHER} />
        <EntityChip kind="doc" id={DOC} />
      </>,
    )
    await settle()
    expect(reads).toEqual([[{ kind: "task", id: TASK }, { kind: "task", id: OTHER }, { kind: "doc", id: DOC }]])
    expect(screen.getAllByText(TASK)).toHaveLength(2)
    expect(screen.getByText(OTHER)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Page: Plan" })).toBeInTheDocument()
  })

  it("reads a thing first asked for when 500 are on the page, rather than forgetting it", async () => {
    answer = async (refs) => refs.map((r) => ({ ...task(), id: r.id }))
    const stops = Array.from({ length: 500 }, (_, i) => watch("task", `t${i}`, () => {}))
    let late: { state: string } | undefined
    void readNow("task", TASK).then((s) => (late = s))
    await settle()
    expect(late?.state).toBe("ok")
    stops.forEach((stop) => stop())
  })

  it("reads a hundred at a time, side by side, and one that fails says so on its own chips only", async () => {
    answer = async (refs) => {
      if (refs.some((r) => r.id === "t0")) throw new Error("offline")
      return refs.map((r) => ({ ...task(), id: r.id }))
    }
    const stops = Array.from({ length: 150 }, (_, i) => watch("task", `t${i}`, () => {}))
    await settle()
    expect(reads.map((r) => r.length)).toEqual([100, 50])
    expect(snapshot("task", "t0").state).toBe("error")
    expect(snapshot("task", "t149").state).toBe("ok")
    stops.forEach((stop) => stop())
  })

  it("never shows the name of something the reader can't open, not even while it loads", async () => {
    let release: () => void = () => {}
    answer = (refs) => new Promise((r) => (release = () => r(refs.map((x) => ({ ...x, access: "none" })))))
    const { container } = render(<EntityChip kind="doc" id={DOC} />)
    await settle()
    expect(container.querySelector('[data-state="loading"]')).not.toBeNull()
    await act(async () => release())
    await settle()
    expect(screen.getByText("No access")).toBeInTheDocument()
    expect(screen.getByRole("link")).toHaveAccessibleName("A page you can't open")
    // A page still opens, to its own page, which offers Request access.
    fireEvent.click(screen.getByRole("link"))
    expect(push).toHaveBeenCalledWith(`/app/doc/${DOC}`)
  })

  it("opens a new tab on the middle button, and nothing on a right click", async () => {
    answer = async () => [{ kind: "doc", id: DOC, access: "ok", data: { title: "Plan" } }]
    const opened = vi.spyOn(window, "open").mockImplementation(() => null)
    render(<EntityChip kind="doc" id={DOC} />)
    await settle()
    const chip = screen.getByRole("link")
    fireEvent(chip, new MouseEvent("auxclick", { button: 2, bubbles: true, cancelable: true }))
    expect(opened).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
    fireEvent(chip, new MouseEvent("auxclick", { button: 1, bubbles: true, cancelable: true }))
    expect(opened).toHaveBeenCalledWith(`/app/doc/${DOC}`, "_blank", "noopener")
    opened.mockRestore()
  })

  it("reads a task again when its project's topic says it changed, and no other", async () => {
    answer = async () => [task()]
    render(<EntityChip kind="task" id={TASK} />)
    await settle()
    expect(screen.getByText("Write the launch post")).toBeInTheDocument()
    const hear = topics.get(TOPIC)!
    answer = async () => [task({ name: "Write the launch post", status: "done", status_name: "Done", done: true })]
    await act(async () => hear(JSON.stringify({ type: MqttMessageType.Task_Changed, data: { task_uuid: OTHER } })))
    await settle()
    expect(reads).toHaveLength(1)
    await act(async () => hear(JSON.stringify({ type: MqttMessageType.Task_Changed, data: { task_uuid: TASK.toUpperCase() } })))
    await settle()
    expect(reads).toHaveLength(2)
    expect(document.querySelector('[data-status-glyph="done"]')).not.toBeNull()
  })

  it("says a read failed, keeps no empty chip, and tries again when clicked", async () => {
    answer = async () => {
      throw new Error("offline")
    }
    render(<EntityChip kind="task" id={TASK} />)
    await settle()
    expect(screen.getByText("Couldn't load")).toBeInTheDocument()
    answer = async () => [task()]
    fireEvent.click(screen.getByRole("link"))
    await settle()
    expect(screen.getByText("Write the launch post")).toBeInTheDocument()
  })

  it("says a deleted task is deleted, and opens nothing", async () => {
    answer = async () => [{ kind: "task", id: TASK, access: "gone" }]
    render(<EntityChip kind="task" id={TASK} />)
    await settle()
    expect(screen.getByText("Deleted task")).toBeInTheDocument()
    expect(screen.queryByRole("link")).toBeNull()
  })

  it("opens a task on Enter, and shows its card on Space with the focus in it, given back on Escape", async () => {
    answer = async () => [task()]
    // A phone, where a task opens on its own page (beside the doc on a desktop).
    const was = window.matchMedia
    window.matchMedia = ((media: string) => ({ matches: true, media })) as unknown as typeof window.matchMedia
    try {
      render(<EntityChip kind="task" id={TASK} />)
      await settle()
      const chip = screen.getByRole("link")
      act(() => chip.focus())
      fireEvent.keyDown(chip, { key: " " })
      // The card's code loads on first use: a loaded machine takes a while.
      const card = await screen.findByRole("dialog", undefined, { timeout: 5000 })
      await vi.waitFor(() => expect(card.textContent).toContain("Write the launch post"), { timeout: 5000 })
      await vi.waitFor(() => expect(card.contains(document.activeElement)).toBe(true), { timeout: 5000 })
      expect(push).not.toHaveBeenCalled()
      fireEvent.keyDown(document.activeElement!, { key: "Escape" })
      await vi.waitFor(() => expect(screen.queryByRole("dialog")).toBeNull(), { timeout: 5000 })
      await vi.waitFor(() => expect(document.activeElement).toBe(chip), { timeout: 5000 })
      fireEvent.keyDown(chip, { key: "Enter" })
      expect(push).toHaveBeenCalledWith(`/app/task/${TASK}`)
    } finally {
      window.matchMedia = was
    }
  })

  it("reads what chips show again when the network comes back, or the tab after half a minute away", async () => {
    answer = async (refs) => refs.map(() => task())
    render(<EntityChip kind="task" id={TASK} />)
    await settle()
    expect(reads).toHaveLength(1)

    act(() => void window.dispatchEvent(new Event("online")))
    await settle()
    expect(reads).toHaveLength(2)

    // Away for a moment: nothing to read again.
    const visibility = vi.spyOn(document, "visibilityState", "get")
    const now = vi.spyOn(Date, "now")
    try {
      const away = (ms: number) => {
        now.mockReturnValue(1_000_000)
        visibility.mockReturnValue("hidden")
        act(() => void document.dispatchEvent(new Event("visibilitychange")))
        now.mockReturnValue(1_000_000 + ms)
        visibility.mockReturnValue("visible")
        act(() => void document.dispatchEvent(new Event("visibilitychange")))
      }
      away(5_000)
      await settle()
      expect(reads).toHaveLength(2)
      away(30_000)
      await settle()
      expect(reads).toHaveLength(3)
    } finally {
      visibility.mockRestore()
      now.mockRestore()
    }
  })

  it("marks a task due today and one past due", async () => {
    const today = dayKey(new Date())
    answer = async () => [task({ due: today }), { ...task({ due: "2020-01-01", name: "Old" }), id: OTHER }]
    render(
      <>
        <EntityChip kind="task" id={TASK} />
        <EntityChip kind="task" id={OTHER} />
      </>,
    )
    await settle()
    expect(screen.getByText("Today").closest("[data-entity-chip]")?.className).toContain("bg-camp-sun-tint")
    expect(screen.getByText("Old").closest("[data-entity-chip]")?.className).toContain("text-danger-ink")
  })

  it("takes a kind once: a second registration of a name is a mistake", () => {
    expect(() => registerEntityKind({ kind: "task", icon: "span", noun: "task", view: () => ({ title: "" }), href: () => null })).toThrow(/twice/)
  })

  it("lets another area register its own kind and read it its own way", async () => {
    registerEntityKind<{ title: string }>({
      kind: "testEvent",
      icon: "span",
      noun: "event",
      read: async (ids) => new Map(ids.map((id) => [id, { access: "ok" as const, data: { title: `Event ${id}` } }])),
      view: (d) => ({ title: d.title }),
      href: (id) => `/app/calendar?event=${id}`,
    })
    function Probe() {
      const e = useLiveEntity<{ title: string }>("testEvent", "e1")
      return <span>{e.state === "ok" ? e.data?.title : e.state}</span>
    }
    render(<Probe />)
    await settle()
    expect(screen.getByText("Event e1")).toBeInTheDocument()
    expect(reads).toEqual([])
  })
})

describe("a date as a chip reads it", () => {
  it("says today, tomorrow and yesterday near today, and the date further off", () => {
    expect(dateLabel("2026-10-14", "2026-10-14")).toBe("Today")
    expect(dateLabel("2026-10-15", "2026-10-14")).toBe("Tomorrow")
    expect(dateLabel("2026-10-13", "2026-10-14")).toBe("Yesterday")
    expect(dateLabel("2026-10-20", "2026-10-14")).toBe("20 Oct")
    expect(dateLabel("2025-12-31", "2026-10-14")).toBe("31 Dec 2025")
  })

  it("ages: tomorrow's Today reads Yesterday, with the page still open", async () => {
    vi.setSystemTime(new Date(2026, 9, 14, 12))
    render(<EntityChip kind="date" id="2026-10-14" />)
    await settle()
    expect(screen.getByText("Today")).toBeInTheDocument()
    vi.setSystemTime(new Date(2026, 9, 15, 9))
    await act(async () => document.dispatchEvent(new Event("visibilitychange")))
    expect(screen.getByText("Yesterday")).toBeInTheDocument()
    expect(reads).toEqual([])
  })
})
