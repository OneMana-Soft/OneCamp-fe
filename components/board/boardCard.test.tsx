import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

// Cards on the board (miro-13): a OneCamp thing drawn live in an embeddable's
// box. The server's read and the broker are stood in for, as the chips' own
// tests do: readEntities answers what each test says, and useMqttTopic hands
// the test the handler a card listens with.
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
const posted: unknown[] = []
vi.mock("@/hooks/usePost", () => ({
  usePost: () => ({
    makeRequest: async (o: unknown) => {
      posted.push(o)
      return {}
    },
  }),
}))

import { MqttMessageType } from "@/services/mqttService"
import { PostEndpointUrl } from "@/services/endPoints"
import { resetLiveEntities } from "@/lib/liveEntity/store"
import { pinTestClock } from "@/lib/testing/testClock"
import { CARD_KINDS } from "@/lib/board/cards"
import { entityKind } from "@/lib/liveEntity"
import { BoardEmbedView } from "./boardCard"
import GuestEmbedView, { CARD_NOUNS } from "./boardEmbeds"

pinTestClock()

const TASK = "7a5c0000-0000-4000-8000-0000000000b1"
const TOPIC = "message/PROJECT"
const task = (over: Record<string, unknown> = {}) => ({
  kind: "task",
  id: TASK,
  access: "ok",
  topic: TOPIC,
  data: {
    name: "Book the venue",
    status: "inProgress",
    status_name: "In progress",
    done: false,
    can_edit: true,
    key: "EV-12",
    project_id: "p1",
    assignee: { uuid: "u1", name: "Sam Rivera" },
    ...over,
  },
})

async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0))
    await Promise.resolve()
  })
}

beforeEach(() => {
  reads.length = 0
  posted.length = 0
  topics.clear()
  resetLiveEntities()
})
afterEach(cleanup)

describe("a task's card on the board", () => {
  it("says its status, key, name and who has it, live from its topic", async () => {
    answer = async () => [task()]
    render(<BoardEmbedView embed={{ card: { kind: "task", id: TASK } }} />)
    await settle()
    const card = screen.getByRole("group", { name: "Task: Book the venue" })
    expect(card.getAttribute("data-card-state")).toBe("ok")
    expect(card.textContent).toContain("In progress")
    expect(card.textContent).toContain("EV-12")
    expect(card.textContent).toContain("Sam Rivera")

    // Someone moves it on elsewhere: the topic says so, and the card reads it again.
    answer = async () => [task({ status: "done", status_name: "Done", done: true })]
    await act(async () => topics.get(TOPIC)?.(JSON.stringify({ type: MqttMessageType.Task_Changed, data: { task_uuid: TASK } })))
    await settle()
    expect(screen.getByRole("group", { name: "Task: Book the venue" }).textContent).toContain("Done")
  })

  it("someone who may change it ticks it done in place, with the list's own request", async () => {
    answer = async () => [task()]
    render(<BoardEmbedView embed={{ card: { kind: "task", id: TASK } }} />)
    await settle()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Mark Book the venue done" })))
    expect(posted).toEqual([
      { apiEndpoint: PostEndpointUrl.UpdateTaskStatus, payload: { task_status: "done", task_uuid: TASK, task_project_uuid: "p1" } },
    ])
  })

  it("someone who may not change it gets no tick, only the way to open it", async () => {
    answer = async () => [task({ can_edit: false })]
    render(<BoardEmbedView embed={{ card: { kind: "task", id: TASK } }} />)
    await settle()
    expect(screen.queryByRole("button", { name: /done$/ })).toBeNull()
    expect(screen.getByRole("button", { name: "Open the task" })).toBeTruthy()
  })

  it("a task the reader can't open says No access, never its name", async () => {
    answer = async () => [{ kind: "task", id: TASK, access: "none" }]
    render(<BoardEmbedView embed={{ card: { kind: "task", id: TASK } }} />)
    await settle()
    const card = document.querySelector("[data-board-card='task']")
    expect(card?.getAttribute("data-card-state")).toBe("none")
    expect(card?.textContent).toContain("No access")
    expect(card?.textContent).not.toContain("Book the venue")
  })

  it("a guest's card stays shut and reads nothing", async () => {
    answer = async () => [task()]
    render(<GuestEmbedView embed={{ card: { kind: "task", id: TASK } }} />)
    await settle()
    expect(reads).toEqual([])
    expect(document.querySelector("[data-board-card='task']")?.textContent).toContain("A OneCamp task")
  })
})

describe("the kinds that draw a card", () => {
  it("are each a kind the chips read live", () => {
    for (const k of CARD_KINDS) {
      expect(entityKind(k), k).toBeTruthy()
      // A guest's shut card calls it what the chips call it, without loading them.
      expect(CARD_NOUNS[k], k).toBe(entityKind(k)?.noun)
    }
  })
})

describe("another site on the board", () => {
  it("is framed as a doc frames it: its own address, sandbox and referrer rule", () => {
    render(
      <BoardEmbedView
        embed={{ frame: { provider: "youtube", name: "YouTube", src: "https://www.youtube-nocookie.com/embed/x", height: 360, sandbox: "allow-scripts", allow: "fullscreen", referrerPolicy: "strict-origin" } }}
      />,
    )
    const frame = screen.getByTitle("YouTube embed")
    expect(frame.getAttribute("src")).toBe("https://www.youtube-nocookie.com/embed/x")
    expect(frame.getAttribute("sandbox")).toBe("allow-scripts")
    expect(frame.getAttribute("referrerpolicy")).toBe("strict-origin")
  })
})
