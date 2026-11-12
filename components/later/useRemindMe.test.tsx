import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { pinTestClock } from "@/lib/testing/testClock"

// Remind me for any thing Later keeps (linear-45 #1: "reminds you about a
// task, doc or project, with the time in words"): one save path and one
// picker, whatever the kind. The picker is Later's own, loaded on the click.
let saved: { id: string; remind_at?: string } | undefined
const save = vi.fn((input: unknown) => Promise.resolve(input))
const remind = vi.fn(() => Promise.resolve())
const remove = vi.fn(() => Promise.resolve())
vi.mock("@/hooks/useLater", () => ({
  useSavedEntry: () => saved,
  useLaterActions: () => ({ save, remind, done: vi.fn(), remove }),
}))
const AT = new Date("2026-10-16T03:30:00Z")
vi.mock("@/components/later/reminderPicker", () => ({
  default: ({ initial, onPick, onClose }: { initial?: Date; onPick: (at: Date) => void; onClose: () => void }) => (
    <div role="dialog" aria-label="Remind me" data-initial={initial?.toISOString() ?? ""}>
      <button type="button" onClick={() => onPick(AT)}>Set reminder</button>
      <button type="button" onClick={onClose}>Cancel</button>
    </div>
  ),
}))

const { useRemindMe } = await import("@/components/later/useRemindMe")

const project = { itemType: "project" as const, itemId: "q4-1", link: "/app/project/q4-1", title: "Q4 launch" }

function Host() {
  const later = useRemindMe(project)
  return (
    <>
      <button type="button" onClick={() => void later.toggle()}>{later.saved ? "Saved for later" : "Save for later"}</button>
      <button type="button" onClick={later.remindMe}>Remind me…</button>
      {later.picker}
    </>
  )
}

afterEach(() => {
  cleanup()
  saved = undefined
  save.mockClear()
  remind.mockClear()
  remove.mockClear()
})

describe("Remind me, for any kind Later keeps", () => {
  pinTestClock()

  it("loads no picker until it is asked for, then saves the thing with the moment picked", async () => {
    render(<Host />)
    expect(screen.queryByRole("dialog")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Remind me…" }))
    await act(async () => fireEvent.click(await screen.findByRole("button", { name: "Set reminder" })))
    expect(save).toHaveBeenCalledWith({ item_type: "project", item_id: "q4-1", link: "/app/project/q4-1", title: "Q4 launch", context: undefined, remind_at: AT.toISOString() })
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("moves the reminder of a thing already saved, starting from the one set", async () => {
    saved = { id: "l7", remind_at: "2026-10-20T03:30:00Z" }
    render(<Host />)
    fireEvent.click(screen.getByRole("button", { name: "Remind me…" }))
    expect((await screen.findByRole("dialog")).getAttribute("data-initial")).toBe("2026-10-20T03:30:00.000Z")
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Set reminder" })))
    expect(remind).toHaveBeenCalledWith("l7", AT)
    expect(save).not.toHaveBeenCalled()
  })

  it("closes on Cancel with nothing saved", async () => {
    render(<Host />)
    fireEvent.click(screen.getByRole("button", { name: "Remind me…" }))
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }))
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(save).not.toHaveBeenCalled()
  })

  it("saves with no reminder, and takes a saved thing out of Later", async () => {
    render(<Host />)
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save for later" })))
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ item_type: "project", item_id: "q4-1", remind_at: null }))
    cleanup()
    saved = { id: "l7" }
    render(<Host />)
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Saved for later" })))
    expect(remove).toHaveBeenCalledWith("l7")
  })
})
