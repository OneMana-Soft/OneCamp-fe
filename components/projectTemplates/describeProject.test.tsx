import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

vi.mock("@/components/common/withFeature", () => ({ withAI: <T,>(c: T) => c }))
let answer: (signal?: AbortSignal) => Promise<unknown>
const asked: string[] = []
vi.mock("@/hooks/useProjectTemplates", () => ({
  draftProjectPlan: (d: string, signal?: AbortSignal) => {
    asked.push(d)
    return answer(signal)
  },
}))

const { DescribeProject } = await import("./DescribeProject")

afterEach(() => {
  cleanup()
  asked.length = 0
})

const open = () => {
  fireEvent.click(screen.getByRole("button", { name: /describe it/i }))
  return screen.getByLabelText("What is the project, and by when?")
}

describe("describing a project for the AI", () => {
  it("waits for a sentence, then hands over the plan", async () => {
    const plan = { name: "Launch", tasks: [{ name: "Plan" }] }
    answer = async () => plan
    const onDrafted = vi.fn()
    render(<DescribeProject onDrafted={onDrafted} />)
    const box = open()
    fireEvent.change(box, { target: { value: "launch" } })
    expect((screen.getByRole("button", { name: "Draft the plan" }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(box, { target: { value: "Launch the app in six weeks" } })
    fireEvent.keyDown(box, { key: "Enter", ctrlKey: true })
    await waitFor(() => expect(onDrafted).toHaveBeenCalledWith(plan))
    expect(asked).toEqual(["Launch the app in six weeks"])
    expect(screen.queryByLabelText("What is the project, and by when?")).toBeNull()
  })

  it("says it can take a while while it drafts", async () => {
    answer = () => new Promise(() => {})
    render(<DescribeProject onDrafted={() => {}} />)
    fireEvent.change(open(), { target: { value: "Plan the offsite for May" } })
    fireEvent.click(screen.getByRole("button", { name: "Draft the plan" }))
    expect(await screen.findByText(/can take a minute or two/)).toBeTruthy()
    expect(screen.getByRole("button", { name: "Drafting…" })).toBeTruthy()
  })

  it("says why when the AI can't draft it, and keeps what was typed", async () => {
    answer = async () => {
      throw { response: { data: { msg: "The AI isn't on in this workspace. Pick a template instead." } } }
    }
    render(<DescribeProject onDrafted={() => {}} />)
    fireEvent.change(open(), { target: { value: "Plan the offsite for May" } })
    fireEvent.click(screen.getByRole("button", { name: "Draft the plan" }))
    expect((await screen.findByRole("alert")).textContent).toBe("The AI isn't on in this workspace. Pick a template instead.")
    expect((screen.getByLabelText("What is the project, and by when?") as HTMLTextAreaElement).value).toBe("Plan the offsite for May")
  })

  it("stops asking on Cancel, without an error", async () => {
    let seen: AbortSignal | undefined
    answer = (signal) =>
      new Promise((_, reject) => {
        seen = signal
        signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")))
      })
    const onDrafted = vi.fn()
    render(<DescribeProject onDrafted={onDrafted} />)
    fireEvent.change(open(), { target: { value: "Plan the offsite for May" } })
    fireEvent.click(screen.getByRole("button", { name: "Draft the plan" }))
    await waitFor(() => expect(seen).toBeDefined())
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    expect(seen?.aborted).toBe(true)
    await new Promise((r) => setTimeout(r, 0))
    expect(screen.queryByRole("alert")).toBeNull()
    expect(onDrafted).not.toHaveBeenCalled()
  })
})
