import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { pinTestClock } from "@/lib/testing/testClock"

// Settings > Docs (docs C6-2).

const answers = new Map<string, unknown>()
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (key: string) => ({ data: answers.get(key), isLoading: false, isError: undefined, mutate: vi.fn() }),
}))
vi.mock("@/lib/swrMutate", () => ({ appMutate: vi.fn(async () => undefined) }))
// A saved change is offered back on the toast (components/ui/undoToast), which takes the module's toast.
const toast = vi.hoisted(() => vi.fn())
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }), toast }))
const confirm = vi.fn()
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => confirm }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))
vi.mock("@/components/common/peoplePicker", () => ({
  PeoplePicker: ({ onChange }: { onChange(p: { uuid: string; name: string }[]): void }) => (
    <button type="button" onClick={() => onChange([{ uuid: "33333333-3333-4333-8333-333333333333", name: "Maya Chen" }])}>
      Pick Maya
    </button>
  ),
}))
const svc = vi.hoisted(() => ({ setPolicy: vi.fn(), linksStoppedBy: vi.fn(), handOver: vi.fn(), turnOffLinks: vi.fn() }))
vi.mock("@/services/docAdminService", async (orig) => ({ ...(await orig<object>()), ...svc }))

import DocPoliciesCard from "./DocPoliciesCard"
import { TooltipProvider } from "@/components/ui/tooltip"
import { ADMIN_POLICIES_KEY } from "@/services/workAccessService"
import { DEPARTED_KEY } from "@/services/docAdminService"

const policy = (key: string, value: unknown) => ({ key, kind: "x", label: key, help: "", value, default: value, is_set: false })
function workspace(maxDays = 0, people: unknown[] = []) {
  answers.set(ADMIN_POLICIES_KEY, { data: [policy("docs.export.members", true), policy("guest.link.max_days", maxDays), policy("embed.allowlist", null)] })
  answers.set(DEPARTED_KEY, { data: { people } })
}
const DANA = { user_uuid: "11111111-1111-4111-8111-111111111111", name: "Dana Ross", left_at: "2026-10-01T09:00:00Z", docs: 12, links: 3 }

describe("Settings > Docs", () => {
  pinTestClock()
  afterEach(() => {
    cleanup()
    answers.clear()
    Object.values(svc).forEach((f) => f.mockReset())
    confirm.mockReset()
    toast.mockReset()
  })

  it("says how many links a shorter lifetime stops before it saves", async () => {
    workspace(0)
    svc.linksStoppedBy.mockResolvedValue(12)
    svc.setPolicy.mockResolvedValue(policy("guest.link.max_days", 30))
    render(<DocPoliciesCard />)
    await act(async () => fireEvent.click(screen.getByRole("radio", { name: "30 days" })))
    expect(svc.linksStoppedBy).toHaveBeenCalledWith(30)
    const asked = confirm.mock.calls[0][0] as { title: string; description: string; onConfirm(): Promise<void> }
    expect(asked.description).toMatch(/^12 links older than 30 days stop working now\./)
    expect(svc.setPolicy).not.toHaveBeenCalled()
    await act(async () => asked.onConfirm())
    expect(svc.setPolicy).toHaveBeenCalledWith("guest.link.max_days", 30)
  })

  it("saves a longer lifetime, or one that stops nothing, without asking", async () => {
    workspace(30)
    svc.setPolicy.mockResolvedValue(policy("guest.link.max_days", 90))
    render(<DocPoliciesCard />)
    await act(async () => fireEvent.click(screen.getByRole("radio", { name: "90 days" })))
    expect(svc.linksStoppedBy).not.toHaveBeenCalled()
    expect(confirm).not.toHaveBeenCalled()
    expect(svc.setPolicy).toHaveBeenCalledWith("guest.link.max_days", 90)
  })

  // design-14, item 2: a saved change is offered back on the toast, and Undo saves what was there.
  it("offers each change back, and Undo puts back what was there", async () => {
    workspace(30)
    svc.setPolicy.mockImplementation(async (key: string, value: unknown) => policy(key, value))
    render(<DocPoliciesCard />)
    // By its title: an earlier case's offer can still arrive (offerBack loads with the toast's chunk).
    const offered = async (title: string) => {
      await waitFor(() => expect(toast.mock.calls.some(([t]) => t.action && t.title === title)).toBe(true))
      const offer = toast.mock.calls.map(([t]) => t).find((t) => t.action && t.title === title)
      toast.mockReset()
      await act(async () => offer.action.props.onClick())
    }
    await act(async () => fireEvent.click(screen.getByRole("radio", { name: "90 days" })))
    await offered("Longest a link lasts: 90 days")
    expect(svc.setPolicy).toHaveBeenLastCalledWith("guest.link.max_days", 30)
    await act(async () => fireEvent.click(screen.getByRole("switch", { name: "Members can export docs" })))
    await offered("Members can export docs: Off")
    expect(svc.setPolicy).toHaveBeenLastCalledWith("docs.export.members", true)
  })

  it("lists who left with work under their name, and hands it on to someone", async () => {
    workspace(0, [DANA])
    svc.handOver.mockResolvedValue({ docs: 12, links: 3, failed: 0 })
    render(<DocPoliciesCard />)
    const row = document.querySelector(`[data-departed="${DANA.user_uuid}"]`) as HTMLElement
    expect(row.textContent).toContain("Dana Ross")
    expect(row.textContent).toContain("12 docs and 3 links")
    fireEvent.click(within(row).getByRole("button", { name: "Hand on…" }))
    const dialog = screen.getByRole("dialog")
    expect(within(dialog).getByRole("button", { name: "Hand on" })).toBeDisabled()
    fireEvent.click(within(dialog).getByRole("button", { name: "Pick Maya" }))
    await act(async () => fireEvent.click(within(dialog).getByRole("button", { name: "Hand on" })))
    expect(svc.handOver).toHaveBeenCalledWith(DANA.user_uuid, "33333333-3333-4333-8333-333333333333")
    expect(toast.mock.calls[0][0]).toMatchObject({ title: "Handed on to Maya Chen", description: "12 docs and 3 links moved." })
  })

  it("asks before turning their links off", async () => {
    workspace(0, [DANA])
    svc.turnOffLinks.mockResolvedValue(3)
    render(<DocPoliciesCard />)
    fireEvent.click(screen.getByRole("button", { name: "Turn off links" }))
    const asked = confirm.mock.calls[0][0] as { title: string; destructive: boolean; onConfirm(): Promise<void> }
    expect(asked).toMatchObject({ title: "Turn off Dana Ross's links?", destructive: true })
    expect(svc.turnOffLinks).not.toHaveBeenCalled()
    await act(async () => asked.onConfirm())
    expect(svc.turnOffLinks).toHaveBeenCalledWith(DANA.user_uuid)
  })

  it("calls its first section Policies, keeps the export switch a switch row, and names every built-in site", async () => {
    workspace(0)
    svc.setPolicy.mockResolvedValue(policy("docs.export.members", false))
    render(<DocPoliciesCard />)
    expect(screen.getByRole("heading", { name: "Policies" })).toBeTruthy()
    const sw = screen.getByRole("switch", { name: /Members can export docs/ })
    expect(sw.closest('[data-setting-row="switch"]')).not.toBeNull()
    await act(async () => fireEvent.click(sw))
    expect(svc.setPolicy).toHaveBeenCalledWith("docs.export.members", false)
    const sites = document.querySelector("[data-built-in-sites]") as HTMLElement
    expect(sites.textContent).toContain("Spotify")
    fireEvent.click(within(sites).getByRole("button", { name: /more$/ }))
    expect(within(sites).queryByRole("button", { name: /more$/ })).toBeNull()
  })

  it("says a refused list once, under the field, keeps the row's hint, and tints the site it names", async () => {
    workspace(0)
    svc.setPolicy.mockRejectedValue({ response: { status: 400, data: { msg: "intranet.local isn't a public site." } } })
    render(
      <TooltipProvider>
        <DocPoliciesCard />
      </TooltipProvider>,
    )
    const field = screen.getByRole("textbox", { name: /Sites docs can embed/ })
    fireEvent.change(field, { target: { value: "wiki.acme.com intranet.local " } })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save sites" })))
    expect(screen.getByRole("alert").textContent).toBe("intranet.local isn't a public site.")
    // Said once: the row keeps its hint, with no "Not saved." in the same words above the field. A screen
    // reader hears "Not saved." from the row's status (SavedTick), and the reason from the field.
    expect(screen.queryByText(/Not saved/, { ignore: ".sr-only, script, style" })).toBeNull()
    expect(screen.getByText(/Add your own sites/)).toBeInTheDocument()
    const chip = (entry: string) => Array.from(document.querySelectorAll("[data-allow-chip]")).find((c) => c.textContent?.startsWith(entry))!
    expect(chip("intranet.local").getAttribute("data-invalid")).toBe("true")
    expect(chip("wiki.acme.com").getAttribute("data-invalid")).toBeNull()
  })

  it("says when no one who left has work under their name", () => {
    workspace(0, [])
    render(<DocPoliciesCard />)
    expect(screen.getByText("No one who left has docs or links under their name.")).toBeTruthy()
  })
})
