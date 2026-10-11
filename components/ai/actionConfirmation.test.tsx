import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { readFileSync } from "node:fs"
import { join } from "node:path"

/** hub.md AI9: the confirmation card, in the answer's column. */
const execute = vi.fn()
vi.mock("@/services/aiService", () => ({ useExecuteAction: () => ({ executeAction: execute }) }))
vi.mock("react-redux", () => ({ useDispatch: () => vi.fn() }))
vi.mock("@/hooks/useFetch", () => ({ useFetchOnlyOnce: () => ({ data: undefined }) }))

import ActionConfirmation, { actionHeadline, isRefusal } from "@/components/ai/ActionConfirmation"

const task = (name: string) => ({ tool_name: "create_task", params: { task_name: name, project_name: "Q4 launch" }, description: `Create ${name}` })
const three = [task("Post the load-test numbers"), task("Add rollback steps"), task("Final pass on the announcement")]

afterEach(() => {
  cleanup()
  execute.mockReset()
})

describe("the confirmation card", () => {
  it("names the verb and the count in its title and its one primary button", () => {
    expect(actionHeadline(three)).toMatchObject({ label: "Create 3 tasks", done: "Created 3 tasks", place: "Q4 launch" })
    render(<ActionConfirmation actions={three} />)
    expect(screen.getByText("Create 3 tasks in Q4 launch")).toBeTruthy()
    expect(screen.getByRole("button", { name: /^Create 3 tasks/ })).toBeTruthy()
    expect(screen.getByText(/Acts as you/)).toBeTruthy()
    expect(screen.getByText(/written to your record/)).toBeTruthy()
  })

  it("is a card in the column, never a dialog, with the agent's top edge", () => {
    const { container } = render(<ActionConfirmation actions={three} />)
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(container.querySelector("[data-action-card]")?.className).toMatch(/agent-a1/)
  })

  it("ticks each row as it lands and folds to its result", async () => {
    execute.mockResolvedValue({ success: true, message: "ok" })
    const { container } = render(<ActionConfirmation actions={three} />)
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Create 3 tasks/ }))
    })
    expect(execute).toHaveBeenCalledTimes(3)
    expect(container.querySelector('[data-action-card="done"]')?.textContent).toContain("Created 3 tasks in Q4 launch")
  })

  it("says a refusal in the agent's tint, never danger, and that nothing changed", async () => {
    execute.mockResolvedValue({ success: false, message: "Not allowed: you're not a member of #drill-finance." })
    const { container } = render(<ActionConfirmation actions={[task("x")]} />)
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Create 1 task/ }))
    })
    const band = container.querySelector("[data-refusal]")!
    expect(band.className).toContain("bg-agent-muted")
    expect(band.className).toContain("text-agent-ink")
    expect(band.className).not.toMatch(/danger|destructive|brand/)
    expect(band.textContent).toContain("Nothing was changed.")
    expect(isRefusal("Couldn't reach the server")).toBe(false)
  })

  it("retries only the actions that failed", async () => {
    execute
      .mockResolvedValueOnce({ success: true, message: "ok" })
      .mockResolvedValueOnce({ success: false, message: "Timed out" })
      .mockResolvedValueOnce({ success: true, message: "ok" })
    const { container } = render(<ActionConfirmation actions={three} />)
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Create 3 tasks/ }))
    })
    expect(container.querySelector("[data-partial]")?.textContent).toBe("2 of 3 created")
    execute.mockResolvedValue({ success: true, message: "ok" })
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Retry 1" }))
    })
    expect(execute).toHaveBeenCalledTimes(4)
    expect(execute.mock.calls[3][1]).toEqual(three[1].params)
  })

  it("cancels to one quiet line and leaves the message's words alone", () => {
    const onClose = vi.fn()
    const { container } = render(<ActionConfirmation actions={three} onClose={onClose} />)
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    expect(container.textContent).toBe("Cancelled · nothing was changed")
    expect(onClose).toHaveBeenCalled()
    // The panel no longer rewrites the assistant's text on dismissal.
    const panel = readFileSync(join(__dirname, "AiChatPanel.tsx"), "utf8")
    expect(panel).not.toMatch(/Action dismissed/)
  })
})
