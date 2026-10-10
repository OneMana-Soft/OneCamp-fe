import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

// The lines under a member's name in their profile. The demo's shared visitor
// gets every other member with a blank address; the line that printed it
// showed as an empty grey gap (a non-breaking space held it open).

const { profile } = vi.hoisted(() => ({ profile: { data: { data: {} as Record<string, unknown> } } }))
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => profile }))
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: "" }) }))
vi.mock("@/hooks/useUserInfoState", () => ({ useUserInfoState: () => undefined }))
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
  const block = screen.getByRole("heading", { name }).closest(".text-center")!
  return Array.from(block.querySelectorAll(":scope > p")).map((p) => p.textContent ?? "")
}

describe("a member's profile", () => {
  it("shows the address under the names", () => {
    profile.data.data = { ...maya, user_email_id: "maya@example.com" }
    render(<OtherProfileDialog userUUID="u-maya" dialogOpenState setOpenState={() => {}} />)
    expect(linesUnderName("maya")).toEqual(["Maya Chen · @maya", "maya@example.com"])
  })

  it("shows no empty line when the address is blank, and the handle once", () => {
    profile.data.data = { ...maya, user_email_id: "" }
    render(<OtherProfileDialog userUUID="u-maya" dialogOpenState setOpenState={() => {}} />)
    expect(linesUnderName("maya")).toEqual(["Maya Chen · @maya"])
  })

  it("shows nothing under the name with no address, handle or other name", () => {
    profile.data.data = { user_uuid: "u-sam", user_name: "Sam", user_email_id: "" }
    render(<OtherProfileDialog userUUID="u-sam" dialogOpenState setOpenState={() => {}} />)
    expect(linesUnderName("Sam")).toEqual([])
  })
})
