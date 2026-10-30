import { act, cleanup, render } from "@testing-library/react"
import { OWN_ERRORS } from "@/lib/axiosInstance"
import { afterEach, describe, expect, it, vi } from "vitest"

// A doc comment made a task (docs C5-2): once the task exists it is tied to
// its thread, so resolving either resolves both.

const post = vi.fn<(...a: unknown[]) => Promise<unknown>>(async () => ({ data: { data: {} } }))
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { post: (...a: unknown[]) => post(...a) } }))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest: vi.fn(async () => ({})) }) }))
const { toast } = vi.hoisted(() => ({ toast: vi.fn() }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }))
let created: ((t: { taskUUID: string; name: string }) => void) | undefined
vi.mock("@/components/task/taskCreateForm", () => ({
  default: (p: { onCreated?: (t: { taskUUID: string; name: string }) => void }) => {
    created = p.onCreated
    return null
  },
}))

import CreateTaskDialog from "./createTaskDialog"
import { taskDraftFromMessage } from "@/lib/task/messageToTask"

describe("a doc comment made a task", () => {
  afterEach(() => {
    cleanup()
    post.mockClear()
    toast.mockClear()
    created = undefined
  })

  it("says it came from the comment", () => {
    const d = taskDraftFromMessage("<p>Fix the footer</p>", { threadID: "th1", link: "https://x/app/doc/d1?thread=th1", authorName: "Dana" })
    expect(d.name).toBe("Fix the footer")
    expect(d.description).toContain("Dana's comment")
  })

  it("ties the new task to its thread, and tells the card", async () => {
    const linked = vi.fn()
    const source = { threadID: "th1", link: "https://x/app/doc/d1?thread=th1" }
    render(<CreateTaskDialog dialogOpenState setOpenState={() => {}} fromMessage={{ draft: taskDraftFromMessage("<p>Fix</p>", source), source }} onLinked={linked} />)
    expect(created).toBeTypeOf("function")
    await act(async () => created!({ taskUUID: "t-9", name: "Fix" }))
    expect(post).toHaveBeenCalledWith("/threads/th1/task", { task_uuid: "t-9" }, OWN_ERRORS)
    expect(linked).toHaveBeenCalledWith("t-9")
    expect(toast).not.toHaveBeenCalled()
  })

  it("says so when the task couldn't be tied to its thread", async () => {
    post.mockRejectedValueOnce(new Error("offline"))
    const linked = vi.fn()
    const source = { threadID: "th1", link: "https://x/app/doc/d1?thread=th1" }
    render(<CreateTaskDialog dialogOpenState setOpenState={() => {}} fromMessage={{ draft: taskDraftFromMessage("<p>Fix</p>", source), source }} onLinked={linked} />)
    await act(async () => created!({ taskUUID: "t-9", name: "Fix" }))
    expect(linked).not.toHaveBeenCalled()
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "The task isn't tied to the comment", variant: "destructive" }))
  })
})
