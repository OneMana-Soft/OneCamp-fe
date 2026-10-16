import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

// The profile card, design v3 (hub.md P1): a non-modal popover anchored to
// what opened it, with a banner in the person's hue, the presence dot, their
// lines, and per kind: Message for a person, governance for an agent, no
// Message for a bot, Edit profile and Set a status for yourself.

const { profile, self } = vi.hoisted(() => ({
  profile: { data: undefined as { data: Record<string, unknown> } | undefined },
  self: { data: { data: { user_uuid: "u-sam" } } },
}))
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => profile, useFetchOnlyOnce: () => self }))
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: "" }) }))
vi.mock("@/hooks/useUserInfoState", () => ({ useUserInfoState: () => undefined }))
vi.mock("@/hooks/reactions/useEmojiMartData", () => ({ useEmojiMartData: () => ({ data: undefined }) }))
vi.mock("react-redux", () => ({ useDispatch: () => vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock("@/components/ui/botTag", () => ({ BotTag: () => null }))
vi.mock("@/components/admin/InvitePlaceholder", () => ({ InvitePlaceholder: () => null }))

const { setLastAnchor } = await import("@/lib/hub/lastAnchor")
const { default: OtherProfileDialog } = await import("@/components/dialog/otherUserProfileDialog")
const { personHue } = await import("@/lib/utils/getAvatarColor")

afterEach(() => {
  cleanup()
  setLastAnchor(null)
  profile.data = undefined
})

const maya = { user_uuid: "u-maya", user_name: "maya", user_full_name: "Maya Chen", user_handle: "maya", user_status: "online", user_device_connected: 1 }
const open = (uuid = "u-maya") => render(<OtherProfileDialog userUUID={uuid} dialogOpenState setOpenState={() => {}} />)

describe("the profile card (P1)", () => {
  it("is a popover anchored to what was pressed, not a modal dialog", () => {
    const avatar = document.createElement("button")
    document.body.appendChild(avatar)
    avatar.getBoundingClientRect = () => new DOMRect(40, 120, 24, 24)
    setLastAnchor(avatar)
    profile.data = { data: maya }
    open()
    expect(document.querySelector("[data-profile-popover]")).toBeTruthy()
    expect(screen.queryByRole("dialog", { name: /Member profile/ })).toBeNull()
    const box = document.querySelector<HTMLElement>("[data-profile-anchor-box]")!
    expect([box.style.left, box.style.top, box.style.width]).toEqual(["40px", "120px", "24px"])
    avatar.remove()
  })

  it("puts the person's hue on the banner, their presence on the avatar, and Message", async () => {
    profile.data = { data: { ...maya, user_job_title: "Designer" } }
    open()
    // One colour per person (app/personHue.test.ts): keyed on the name she is
    // shown by ("maya"), never her uuid, which drew her a second colour here;
    // the colour of the avatar beside her own messages.
    expect(document.querySelector("[data-profile-banner]")!.getAttribute("data-hue")).toBe(personHue("maya"))
    const { getAvatarFallbackClass } = await import("@/lib/utils/getAvatarColor")
    expect(getAvatarFallbackClass("maya")).toContain(`hue-${personHue("maya")}`)
    expect(document.querySelector("[data-presence]")!.getAttribute("data-presence")).toBe("online")
    expect(screen.getByRole("heading", { name: "maya" })).toBeTruthy()
    expect(screen.getByText("@maya")).toBeTruthy()
    expect(screen.getByText("Designer")).toBeTruthy()
    expect(screen.getByRole("button", { name: /Message/ })).toBeTruthy()
  })

  it("shows its status with the emoji and words", () => {
    profile.data = { data: { ...maya, user_emoji_statuses: [{ status_user_emoji_id: "brain", status_user_emoji_desc: "Deep work" }] } }
    open()
    expect(document.querySelector("[data-profile-status]")!.textContent).toContain("Deep work")
  })

  it("draws an agent square in the agent gradient, with Active", () => {
    profile.data = { data: { user_uuid: "u-rc", user_name: "release-captain", user_full_name: "Release Captain", is_bot: true, user_bot_kind: "agent", user_status: "online" } }
    open("u-rc")
    expect(document.querySelector("[data-profile-card]")!.getAttribute("data-profile-card")).toBe("agent")
    expect(document.querySelector("[data-profile-banner]")!.className).toContain("avatar-agent")
    expect(document.querySelector("[data-agent-state=active]")).toBeTruthy()
    expect(document.querySelector("[data-presence]")).toBeNull()
  })

  it("gives a bot no Message and a neutral banner", () => {
    profile.data = { data: { user_uuid: "u-ci", user_name: "Check-in", is_bot: true, user_bot_kind: "checkin" } }
    open("u-ci")
    expect(document.querySelector("[data-profile-banner]")!.className).toContain("bg-sunken")
    expect(screen.queryByRole("button", { name: /Message/ })).toBeNull()
  })

  it("offers Edit profile and Set a status on your own card", () => {
    profile.data = { data: { ...maya, user_uuid: "u-sam", user_name: "sam" } }
    open("u-sam")
    expect(screen.getByRole("button", { name: /Edit profile/ })).toBeTruthy()
    expect(screen.getByRole("button", { name: /Set a status/ })).toBeTruthy()
    expect(screen.queryByRole("button", { name: /^Message/ })).toBeNull()
  })

  it("holds its shape while it loads, without a dash for every field", () => {
    open()
    expect(screen.getByRole("status", { name: "Loading their profile" })).toBeTruthy()
    expect(document.body.textContent).not.toContain("—")
  })

  it("has no photo to open without one", () => {
    profile.data = { data: maya }
    open()
    expect((screen.getByRole("button", { name: "See maya's photo" }) as HTMLButtonElement).disabled).toBe(true)
  })

  // An agent's card is long: from a name mid-screen it ran off the top at
  // 1440x900 and off the bottom at 1024x768, its name or its actions cut.
  it("is never taller than the room on its side, and scrolls inside", () => {
    profile.data = { data: { user_uuid: "u-rc", user_name: "release-captain", user_full_name: "Release Captain", is_bot: true, user_bot_kind: "agent" } }
    open("u-rc")
    const pop = document.querySelector<HTMLElement>("[data-profile-popover]")!
    expect(pop.className).toContain("max-h-[var(--radix-popover-content-available-height)]")
    expect(pop.className).toContain("overflow-y-auto")
    expect(pop.className).not.toContain("overflow-hidden")
  })

  it("keeps the accent off a glance: Message is a secondary button", () => {
    profile.data = { data: maya }
    open()
    const message = screen.getByRole("button", { name: /Message/ })
    expect(message.className).not.toMatch(/\bbg-brand\b|bg-primary\b/)
    expect(message.className).toContain("bg-raised")
  })
})
