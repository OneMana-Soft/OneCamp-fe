import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

// The lines under a member's name in their profile. The demo's shared visitor
// gets every other member with a blank address; the line that printed it
// showed as an empty grey gap (a non-breaking space held it open).

const { profile } = vi.hoisted(() => ({ profile: { data: { data: {} as Record<string, unknown> | undefined } as { data: Record<string, unknown> | undefined } | undefined } }))
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => profile }))
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: "" }) }))
vi.mock("@/hooks/useUserInfoState", () => ({ useUserInfoState: () => undefined }))
vi.mock("@/hooks/reactions/useEmojiMartData", () => ({ useEmojiMartData: () => ({ data: undefined }) }))
vi.mock("react-redux", () => ({ useDispatch: () => vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock("@/components/ai/AgentCardDetails", () => ({ AgentCardDetails: () => null }))
vi.mock("@/components/admin/InvitePlaceholder", () => ({ InvitePlaceholder: () => null }))
vi.mock("@/components/dialog/attachmentLightboxDialog", () => ({}))

const { default: OtherProfileDialog } = await import("@/components/dialog/otherUserProfileDialog")

afterEach(cleanup)

const maya = { user_uuid: "u-maya", user_name: "maya", user_full_name: "Maya Chen", user_handle: "maya", user_status: "online" }

/** The lines under the name, in order. */
function linesUnderName(name: string): string[] {
  const block = screen.getByRole("heading", { name }).closest("[data-profile-name]")!
  return Array.from(block.querySelectorAll(":scope > p")).map((p) => p.textContent ?? "")
}

describe("a member's profile", () => {
  it("shows the address under the names", () => {
    profile.data = { data: { ...maya, user_email_id: "maya@example.com" } }
    render(<OtherProfileDialog userUUID="u-maya" dialogOpenState setOpenState={() => {}} />)
    expect(linesUnderName("maya")).toEqual(["Maya Chen · @maya", "maya@example.com"])
  })

  it("shows no empty line when the address is blank, and the handle once", () => {
    profile.data = { data: { ...maya, user_email_id: "" } }
    render(<OtherProfileDialog userUUID="u-maya" dialogOpenState setOpenState={() => {}} />)
    expect(linesUnderName("maya")).toEqual(["Maya Chen · @maya"])
  })

  it("shows nothing under the name with no address, handle or other name", () => {
    profile.data = { data: { user_uuid: "u-sam", user_name: "Sam", user_email_id: "" } }
    render(<OtherProfileDialog userUUID="u-sam" dialogOpenState setOpenState={() => {}} />)
    expect(linesUnderName("Sam")).toEqual([])
  })

  // It opened on a column of "—" (every field, the name too) until the
  // profile arrived, and then listed the name twice more under the header.
  it("holds its shape while it loads, without a dash for every field", () => {
    profile.data = undefined
    render(<OtherProfileDialog userUUID="u-maya" dialogOpenState setOpenState={() => {}} />)
    expect(screen.getByRole("status", { name: "Loading their profile" })).toBeTruthy()
    expect(document.body.textContent).not.toContain("—")
  })

  it("lists what they have set, with their status, and not their name again", () => {
    profile.data = { data: { ...maya, user_job_title: "Designer", user_hobbies: "", user_emoji_statuses: [{ status_user_emoji_id: "brain", status_user_emoji_desc: "Deep work" }] } }
    render(<OtherProfileDialog userUUID="u-maya" dialogOpenState setOpenState={() => {}} />)
    const terms = Array.from(document.querySelectorAll("dt")).map((d) => d.textContent)
    expect(terms).toEqual(["Status", "Job title"])
    expect(screen.getByText("Deep work")).toBeTruthy()
    expect(screen.queryByText("Full name")).toBeNull()
  })

  it("opens a photo from a button, and has nothing to open without one", () => {
    profile.data = { data: { ...maya } }
    render(<OtherProfileDialog userUUID="u-maya" dialogOpenState setOpenState={() => {}} />)
    expect((screen.getByRole("button", { name: "See maya's photo" }) as HTMLButtonElement).disabled).toBe(true)
  })
})

describe("the profile card's shape", () => {
  // One 448px column: the photo at 64px beside the name, its few details
  // below. Two 672px columns left one line beside a 128px photo.
  it("is one narrow column with the photo beside the name", async () => {
    const { readFileSync } = await import("node:fs")
    const { resolve } = await import("node:path")
    const src = readFileSync(resolve(__dirname, "otherUserProfileDialog.tsx"), "utf8")
    expect(src).toContain('<DialogContent className="sm:max-w-md">')
    expect(src).toMatch(/data-profile-head="" className="flex items-center gap-4"/)
    expect(src).toContain('<Avatar className="h-16 w-16')
    expect(src).not.toMatch(/md:flex-row|h-32 w-32|sm:max-w-2xl/)
  })
})
