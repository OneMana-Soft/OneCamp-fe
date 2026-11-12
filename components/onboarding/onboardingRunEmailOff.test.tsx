import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { OnboardingState, OnboardingStep } from "@/services/onboardingService"

// The guided first run's invite step on a server that can't send email
// (CR-250 F2): the run hands the server's email_enabled to the shared invite
// form, so the step creates invitations, each row's link is ready, and the
// admin is told once to share them or set up email. onboardingRun.test stands
// the form in; this one runs the real form.

const svc = vi.hoisted(() => ({
  makeSampleProject: vi.fn(),
  removeSampleProject: vi.fn(),
  getOnboardingStatus: vi.fn(),
  dismissOnboarding: vi.fn(),
  setStepSkipped: vi.fn(),
}))
vi.mock("@/services/onboardingService", () => svc)
vi.mock("@/services/onboardingSampleService", () => svc)
vi.mock("@/components/ui/overlayMode", async (actual) => ({ ...(await actual<object>()), useSheetMode: () => false }))
vi.mock("@/components/admin/ImportCard", () => ({ default: () => null }))
const invite = vi.hoisted(() => vi.fn())
vi.mock("@/services/invitationService", () => ({ invite }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))
vi.mock("@/hooks/useCopyToClipboard", () => ({ useCopyToClipboard: () => ({ copied: false, copy: vi.fn(async () => true) }) }))
vi.mock("@/hooks/useClientConfig", async (actual) => {
  const real = await actual<typeof import("@/hooks/useClientConfig")>()
  return { ...real, useClientConfig: () => ({ ...real.DEFAULT_CONFIG, email_enabled: false }) }
})

const { default: OnboardingRun } = await import("./OnboardingRun")

const step = (id: string): OnboardingStep => ({ id, title: id, detail: "", href: "/", done: false })
const state: OnboardingState = { dismissed: false, steps: [step("people"), step("import"), step("project")], done: 0, total: 3, complete: false, skipped: 0 }
const run = () => render(<OnboardingRun state={state} refresh={() => {}} onClose={() => {}} />)
const unsent = "Email isn't set up yet. Share these links, or set up email in Admin › Email."

afterEach(() => {
  cleanup()
  invite.mockReset()
})

describe("the first run's invite step on a server that can't send email", () => {
  it("creates an invitation rather than sending one", async () => {
    run()
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: "ana@example.com" } })
    expect(await screen.findByRole("button", { name: "Create invitation" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: /^Send/ })).toBeNull()
  })

  it("readies each row's link and tells the admin once to share them or set up email", async () => {
    invite
      .mockResolvedValueOnce({ ok: true, answer: { email_sent: false, email_error: "email isn't set up on this server", invite_link: "https://x/a" } })
      .mockResolvedValueOnce({ ok: true, answer: { email_sent: false, email_error: "email isn't set up on this server", invite_link: "https://x/b" } })
    run()
    fireEvent.paste(screen.getByLabelText(/email address/i), { clipboardData: { getData: () => "ana@example.com, bo@example.com" } })
    const create = await screen.findByRole("button", { name: "Create 2 invitations" })
    fireEvent.submit(document.getElementById(create.getAttribute("form")!)!)
    expect(await screen.findByText("2 to share by link")).toBeTruthy()
    const marks = [...document.querySelectorAll("[data-invite-result='created'] [data-invite-mark]")].map((m) => m.getAttribute("data-invite-mark"))
    expect(marks).toEqual(["ready", "ready"])
    expect(screen.getAllByText(unsent)).toHaveLength(1)
    expect(screen.queryByText(/Couldn't email/)).toBeNull()
  })
})
