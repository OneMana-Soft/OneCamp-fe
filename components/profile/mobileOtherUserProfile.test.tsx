import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

const { profile, me } = vi.hoisted(() => ({ profile: { data: undefined as { data: Record<string, unknown> } | undefined }, me: { data: { data: { user_uuid: "u-sam" } } } }))
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => profile, useFetchOnlyOnce: () => me }))
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

// QA SH-05 (14 Oct 2026): your own profile on a phone offered "Message" (a DM
// to yourself) and said "Nothing else on their profile yet."
describe("your own profile", () => {
  it("offers Edit profile and Set a status, never Message", () => {
    profile.data = { data: { user_uuid: "u-sam", user_name: "sam", user_full_name: "Sam Rivera" } }
    render(<MobileOtherUserProfile userUUID="u-sam" />)
    expect(screen.getByRole("button", { name: "Edit profile" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Set a status" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Message" })).toBeNull()
    expect(screen.getByText("Nothing else on your profile yet.")).toBeTruthy()
  })

  it("is someone else's with Message, as before", () => {
    profile.data = { data: { user_uuid: "u-maya", user_name: "maya" } }
    render(<MobileOtherUserProfile userUUID="u-maya" />)
    expect(screen.getByRole("button", { name: "Message" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Edit profile" })).toBeNull()
  })
})

// QA SH-06: a link to someone on a wide screen went home and floated a card
// with no title over it. The page is the profile, with its header.
describe("the profile page on a wide screen", () => {
  it("is headed by whose profile it is, with a way back", () => {
    profile.data = { data: { user_uuid: "u-maya", user_name: "maya" } }
    render(<MobileOtherUserProfile userUUID="u-maya" />)
    expect(screen.getByRole("heading", { level: 1, name: "maya" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Go back" })).toBeTruthy()
  })
})
