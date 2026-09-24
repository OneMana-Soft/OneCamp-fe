import { describe, expect, it, afterEach, beforeEach, vi } from "vitest"
// fireEvent rather than user-event: the latter is not a dependency of this repo.
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

import GovernanceDrillCard, { StepRow } from "@/components/admin/GovernanceDrillCard"
import type { DrillResult, DrillStep } from "@/services/governanceDrillService"

vi.mock("@/services/governanceDrillService", () => ({
  getDrillStatus: vi.fn(),
  setupDrill: vi.fn(),
  runDrill: vi.fn(),
  drillStatusUrl: "/admin/governance-drill",
  drillSetupUrl: "/admin/governance-drill/setup",
  drillRunUrl: "/admin/governance-drill/run",
}))

import { getDrillStatus, runDrill, setupDrill } from "@/services/governanceDrillService"

afterEach(cleanup)
beforeEach(() => vi.clearAllMocks())

const seeded = { seeded: true, allowed_channel: "drill-engineering", forbidden_channel: "drill-finance" }

const step = (over: Partial<DrillStep> = {}): DrillStep => ({
  name: "the post is refused",
  explain: "Checked against the person's live channel membership at the moment of the call.",
  ok: true,
  ...over,
})

const passing = (): DrillResult => ({
  passed: true,
  steps: [step({ name: "the person is not a member" }), step()],
  refusal_reason: "you are not a member of this channel",
  rows: [
    { seq: 1204, id: "a", action: "agent.drill.attempt", summary: "about to attempt", prev_hash: "99998888aaaabbbbcccc", entry_hash: "abcdef0123456789abcdef", created_at: new Date().toISOString() },
    { seq: 1205, id: "b", action: "agent.drill.refused", summary: "refused", prev_hash: "abcdef0123456789abcdef", entry_hash: "1234567890abcdef123456", created_at: new Date().toISOString() },
  ],
  chain_ok: true,
  chain_checked: 500,
  chain_partial: true,
  chain_from_seq: 706,
  ran_at: new Date().toISOString(),
})

const escaped = (): DrillResult => ({
  ...passing(),
  passed: false,
  refusal_reason: "",
  steps: [
    step({ name: "the person is not a member" }),
    step({ ok: false, detail: "THE POST SUCCEEDED. A message was written to #drill-finance on behalf of somebody who is not a member." }),
  ],
})

describe("governance drill card", () => {
  // The whole reason the card exists: an admin must be able to see the refusal
  // rather than take the permission model on faith.
  it("quotes the refusal word for word instead of paraphrasing it", async () => {
    vi.mocked(getDrillStatus).mockResolvedValue(seeded)
    vi.mocked(runDrill).mockResolvedValue(passing())
    render(<GovernanceDrillCard />)

    const runBtn = await screen.findByRole("button", { name: /run the drill/i })
    await act(async () => { fireEvent.click(runBtn) })
    expect(await screen.findByText("you are not a member of this channel")).toBeTruthy()
  })

  // A post that went through is an incident. It must never be communicated by
  // colour alone, which a screen reader and a colour-blind reader both miss.
  it("states in words that the install did not do what it promises", async () => {
    vi.mocked(getDrillStatus).mockResolvedValue(seeded)
    vi.mocked(runDrill).mockResolvedValue(escaped())
    render(<GovernanceDrillCard />)

    const runBtn = await screen.findByRole("button", { name: /run the drill/i })
    await act(async () => { fireEvent.click(runBtn) })
    expect(await screen.findByText(/did not do what it promises/i)).toBeTruthy()
    expect(screen.getByText(/THE POST SUCCEEDED/)).toBeTruthy()
    expect(screen.queryByText(/the limit held/i)).toBeNull()
  })

  // The scope sentence is the part an operator most needs and most often is
  // denied, which is the lesson the system-check card already paid for.
  it("renders every step's explanation, not just its name", async () => {
    vi.mocked(getDrillStatus).mockResolvedValue(seeded)
    vi.mocked(runDrill).mockResolvedValue(passing())
    render(<GovernanceDrillCard />)

    const runBtn = await screen.findByRole("button", { name: /run the drill/i })
    await act(async () => { fireEvent.click(runBtn) })
    await waitFor(() => expect(screen.getAllByText(step().explain).length).toBe(2))
  })

  // A stale PASSED above a spinner would be the worst thing this card could show.
  it("clears the previous verdict before a new run resolves", async () => {
    vi.mocked(getDrillStatus).mockResolvedValue(seeded)
    vi.mocked(runDrill).mockResolvedValue(passing())
    render(<GovernanceDrillCard />)

    const runBtn = await screen.findByRole("button", { name: /run the drill/i })
    await act(async () => { fireEvent.click(runBtn) })
    expect(await screen.findByText(/the limit held/i)).toBeTruthy()

    let release: (v: DrillResult) => void = () => {}
    vi.mocked(runDrill).mockReturnValue(new Promise<DrillResult>((res) => { release = res }))
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /run it again/i })) })
    await waitFor(() => expect(screen.queryByText(/the limit held/i)).toBeNull())
    release(escaped())
  })

  // The story says "#finance"; creating that would collide with a channel a
  // customer's finance team may already have.
  it("never offers to create a bare channel name", async () => {
    vi.mocked(getDrillStatus).mockResolvedValue({ ...seeded, seeded: false })
    vi.mocked(setupDrill).mockResolvedValue(seeded)
    const { container } = render(<GovernanceDrillCard />)

    // Wait for the SETUP COPY, not the button: the button renders (disabled)
    // during loading too, so waiting on it can resolve a render before the
    // explanation exists and leave this assertion reading an empty card.
    await screen.findByText(/Setting up creates two private channels/i)
    const text = container.textContent || ""
    expect(text).toContain("#drill-finance")
    expect(text).not.toMatch(/#finance\b/)
    expect(text).not.toMatch(/#engineering\b/)
  })

  // A window proves the links inside it and seeds from one stored hash it takes
  // on trust. Rendering "the last 500 verify" as "the log is intact" would be the
  // exact overstatement this feature exists to prevent.
  it("does not let a windowed verification read as a full one", async () => {
    vi.mocked(getDrillStatus).mockResolvedValue(seeded)
    vi.mocked(runDrill).mockResolvedValue(passing())
    const { container } = render(<GovernanceDrillCard />)

    const btn = await screen.findByRole("button", { name: /run the drill/i })
    await act(async () => { fireEvent.click(btn) })
    await screen.findByText(/the limit held/i)

    const text = container.textContent || ""
    expect(text).toMatch(/recent entries/i)
    expect(text).toMatch(/not the\s+whole log/i)
    expect(text).not.toMatch(/entries, the whole log/i)
  })

  it("says it checked the whole log when it actually did", async () => {
    vi.mocked(getDrillStatus).mockResolvedValue(seeded)
    vi.mocked(runDrill).mockResolvedValue({ ...passing(), chain_partial: false, chain_from_seq: undefined })
    const { container } = render(<GovernanceDrillCard />)

    const btn = await screen.findByRole("button", { name: /run the drill/i })
    await act(async () => { fireEvent.click(btn) })
    await screen.findByText(/the limit held/i)

    const text = container.textContent || ""
    expect(text).toMatch(/entries, the whole log/i)
    expect(text).not.toMatch(/not the\s+whole log/i)
  })

  // One hash demonstrates nothing; the link is the claim.
  it("shows each row's previous hash beside its own", async () => {
    vi.mocked(getDrillStatus).mockResolvedValue(seeded)
    vi.mocked(runDrill).mockResolvedValue(passing())
    const { container } = render(<GovernanceDrillCard />)

    const btn = await screen.findByRole("button", { name: /run the drill/i })
    await act(async () => { fireEvent.click(btn) })
    await screen.findByText(/the limit held/i)

    const text = (container.textContent || "").replace(/\s+/g, " ")
    expect(text).toMatch(/prev .*→ ?this/i)
    // The refusal row must carry the attempt row's hash forward, which is the
    // whole point of showing both.
    expect(text).toContain("abcdef01")
  })

  // Evidence a reader can go and check beats a claim they have to accept.
  it("links to the audit log rather than asking to be believed", async () => {
    vi.mocked(getDrillStatus).mockResolvedValue(seeded)
    vi.mocked(runDrill).mockResolvedValue(passing())
    const { container } = render(<GovernanceDrillCard />)

    const btn = await screen.findByRole("button", { name: /run the drill/i })
    await act(async () => { fireEvent.click(btn) })
    await screen.findByText(/the limit held/i)

    const link = container.querySelector('a[href*="audit-log"]') as HTMLAnchorElement | null
    expect(link, "no link to the audit log").toBeTruthy()
    // The audit log has its own admin section; ?tab=settings#audit-log still resolves to it.
    expect(link?.getAttribute("href")).toContain("tab=audit")
  })

  // A passing step must not carry a failure detail; that was a real bug in the
  // note handling on the system-check card.
  it("styles a failing step's detail as a failure and a passing step carries none", () => {
    const { container: ok } = render(<StepRow step={step()} index={0} />)
    expect((ok.textContent || "")).not.toMatch(/SUCCEEDED/)
    cleanup()
    const { container: bad } = render(<StepRow step={step({ ok: false, detail: "it went through" })} index={1} />)
    const detail = Array.from(bad.querySelectorAll("p")).find((p) => p.textContent === "it went through")
    expect(detail).toBeTruthy()
    expect(detail?.className).toContain("text-destructive")
  })
})
