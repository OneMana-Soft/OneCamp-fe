import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { TemplateSummary } from "@/lib/projectTemplates"

const builtIn: TemplateSummary = { id: "client-project", name: "Client project", description: "Kickoff to invoice.", built_in: true, task_count: 13, preview: ["Kickoff call", "Collect brand assets"], can_delete: false }
const mine: TemplateSummary = { id: "11111111-1111-4111-8111-111111111111", name: "Retainer", description: "", built_in: false, task_count: 4, preview: ["Monthly report"], created_by: "Maya", can_delete: true }
let templates: TemplateSummary[] = [builtIn, mine]
const calls: string[] = []
vi.mock("@/hooks/useProjectTemplates", () => ({
  useProjectTemplates: () => ({ templates, isLoading: false, isError: false }),
  addTemplate: async (t: { name: string }) => {
    calls.push(`add ${t.name}`)
    return { ...mine, id: "22222222-2222-4222-8222-222222222222", name: t.name }
  },
  deleteTemplate: async (id: string) => {
    calls.push(`delete ${id}`)
  },
  downloadTemplate: async (id: string) => {
    calls.push(`download ${id}`)
  },
}))
const toasts: unknown[] = []
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: (t: unknown) => toasts.push(t) }) }))

const { TemplatePicker } = await import("./TemplatePicker")

afterEach(() => {
  cleanup()
  calls.length = 0
  toasts.length = 0
  templates = [builtIn, mine]
})

describe("the template picker", () => {
  it("offers blank, the built-in templates, then the saved ones", () => {
    render(<TemplatePicker value="" onChange={() => {}} />)
    const radios = screen.getAllByRole("radio")
    expect(radios.map((r) => r.textContent)).toEqual([
      expect.stringMatching(/^Blank/),
      expect.stringMatching(/^Client project13 tasks/),
      expect.stringMatching(/^Retainer4 tasksSaved by Maya/),
    ])
    expect(radios[0].getAttribute("aria-checked")).toBe("true")
  })

  it("chooses one, and previews its tasks", () => {
    const onChange = vi.fn()
    const onChosen = vi.fn()
    const { rerender } = render(<TemplatePicker value="" onChange={onChange} onChosen={onChosen} />)
    fireEvent.click(screen.getByRole("radio", { name: /Client project/ }))
    expect(onChange).toHaveBeenCalledWith("client-project")
    rerender(<TemplatePicker value="client-project" onChange={onChange} onChosen={onChosen} />)
    expect(screen.getByText("Kickoff call · Collect brand assets · 11 more")).toBeTruthy()
    expect(onChosen).toHaveBeenLastCalledWith(builtIn)
  })

  it("falls back to blank when the chosen template is gone", () => {
    const onChange = vi.fn()
    render(<TemplatePicker value="33333333-3333-4333-8333-333333333333" onChange={onChange} />)
    expect(onChange).toHaveBeenCalledWith("")
  })

  it("adds a template from a file and chooses it", async () => {
    const onChange = vi.fn()
    const { container } = render(<TemplatePicker value="" onChange={onChange} />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File([JSON.stringify({ onecamp_template: 1, name: "From Acme", tasks: [{ name: "One" }] })], "acme.json", { type: "application/json" })
    fireEvent.change(input, { target: { files: [file] } })
    await waitFor(() => expect(onChange).toHaveBeenCalledWith("22222222-2222-4222-8222-222222222222"))
    expect(calls).toEqual(["add From Acme"])
  })

  it("says why a file isn't a template, without asking the server", async () => {
    const { container } = render(<TemplatePicker value="" onChange={() => {}} />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(["{}"], "x.json")] } })
    await waitFor(() => expect(toasts).toHaveLength(1))
    expect(toasts[0]).toMatchObject({ variant: "destructive", description: "That file isn't a OneCamp template." })
    expect(calls).toEqual([])
  })

})
