import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

// ?tool=time opens a project's logged time: the demo lands people leaving
// Toggl there, rather than on a header with a clock icon somewhere in it.

let search = ""
const replace = vi.fn()
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(search),
  useRouter: () => ({ replace }),
  usePathname: () => "/app/project/q4-1",
}))
const shown = (name: string) => ({ open }: { open: boolean }) => (open ? <div data-testid={name} /> : null)
vi.mock("@/components/project/ProjectTimeDialog", () => ({ ProjectTimeDialog: shown("time") }))
vi.mock("@/components/project/ProjectFormsDialog", () => ({ ProjectFormsDialog: shown("forms") }))
vi.mock("@/components/project/ProjectShareDialog", () => ({ ProjectShareDialog: shown("share") }))
vi.mock("@/components/projectTemplates/SaveAsTemplateDialog", () => ({ SaveAsTemplateDialog: shown("template") }))
// The project's links (basecamp-16), none here: which project each read of them named, none for nobody.
const linksAsked: Array<string | undefined> = []
vi.mock("@/hooks/useProjectLinks", () => ({ useProjectLinks: (projectId?: string) => (linksAsked.push(projectId), { links: [] }) }))
vi.mock("@/components/project/ProjectLinksDialog", () => ({ ProjectLinksDialog: () => <div data-testid="links" /> }))

const { ProjectToolButtons } = await import("@/components/project/ProjectToolButtons")

afterEach(() => {
  cleanup()
  replace.mockReset()
  search = ""
  linksAsked.length = 0
})

describe("a link to a project's time", () => {
  it("opens the time, and takes the instruction out of the address", async () => {
    search = "tool=time&tab=kanban"
    render(<ProjectToolButtons projectId="q4-1" isAdmin={false} isMember />)
    expect(await screen.findByTestId("time")).toBeTruthy()
    // The rest of the address stays: it says which tab is showing.
    expect(replace).toHaveBeenCalledWith("/app/project/q4-1?tab=kanban", { scroll: false })
  })

  it("waits until the project says who the visitor is", async () => {
    search = "tool=time"
    const { rerender } = render(<ProjectToolButtons projectId="q4-1" isAdmin={false} isMember={false} />)
    expect(screen.queryByTestId("time")).toBeNull()
    expect(replace).not.toHaveBeenCalled()
    // Until it does, the project's links aren't read either.
    expect(linksAsked.length).toBeGreaterThan(0)
    expect(linksAsked.every((id) => id === undefined)).toBe(true)
    rerender(<ProjectToolButtons projectId="q4-1" isAdmin isMember />)
    expect(await screen.findByTestId("time")).toBeTruthy()
    expect(linksAsked.at(-1)).toBe("q4-1")
  })

  it("opens the links its home's strip asks for, for a member", async () => {
    search = "tool=links&tab=list"
    render(<ProjectToolButtons projectId="q4-1" isAdmin={false} isMember />)
    expect(await screen.findByTestId("links")).toBeTruthy()
    expect(replace).toHaveBeenCalledWith("/app/project/q4-1?tab=list", { scroll: false })
  })

  it("opens nothing else a link names", () => {
    for (const tool of ["share", "forms", "template", "anything"]) {
      search = `tool=${tool}`
      render(<ProjectToolButtons projectId="q4-1" isAdmin isMember />)
      expect(screen.queryByTestId(tool)).toBeNull()
      expect(screen.queryByTestId("time")).toBeNull()
      cleanup()
    }
    expect(replace).not.toHaveBeenCalled()
  })
})
