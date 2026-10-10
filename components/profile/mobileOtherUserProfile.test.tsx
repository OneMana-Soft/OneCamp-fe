import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

const { profile } = vi.hoisted(() => ({ profile: { data: undefined as { data: Record<string, unknown> } | undefined } }))
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => profile }))
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: "" }) }))
vi.mock("@/hooks/useUserInfoState", () => ({ useUserInfoState: () => undefined }))
vi.mock("@/hooks/reactions/useEmojiMartData", () => ({ useEmojiMartData: () => ({ data: undefined }) }))
vi.mock("react-redux", () => ({ useDispatch: () => vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock("@/components/ai/AgentCardDetails", () => ({ AgentCardDetails: () => null }))
vi.mock("@/components/admin/InvitePlaceholder", () => ({ InvitePlaceholder: () => null }))

import { MobileOtherUserProfile } from "@/components/profile/mobileOtherUserProfile"

afterEach(cleanup)

describe("a member's profile on a phone", () => {
  it("holds its shape while it loads, without a dash for every field", () => {
    profile.data = undefined
    render(<MobileOtherUserProfile userUUID="u-maya" />)
    expect(screen.getByRole("status", { name: "Loading their profile" })).toBeTruthy()
    expect(document.body.textContent).not.toContain("—")
    expect(document.body.textContent).not.toContain("Loading…")
  })

  it("lists what they have set, with their status, and not their name again", () => {
    profile.data = { data: { user_uuid: "u-maya", user_name: "maya", user_full_name: "Maya Chen", user_job_title: "Designer", user_emoji_statuses: [{ status_user_emoji_id: "brain", status_user_emoji_desc: "Deep work" }] } }
    render(<MobileOtherUserProfile userUUID="u-maya" />)
    expect(Array.from(document.querySelectorAll("dt")).map((d) => d.textContent)).toEqual(["Status", "Job title"])
    expect(screen.queryByText("Full name")).toBeNull()
  })
})
