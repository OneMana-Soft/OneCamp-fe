import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { Provider } from "react-redux"

// V-126: a DM with an agent (a bot, by class) says on a phone what the
// computer's header says: the agent's role where a person's presence would be,
// and no huddle with it. A person's DM still says where they are and offers
// one. The huddle waits until it is known who the DM is with, so an agent's
// bar never shows one for a moment.

/** What each read answers in a test, by its address. */
const answers = new Map<string, unknown>()
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) => ({ data: answers.get(url), mutate: vi.fn() }),
  useFetchOnlyOnce: (url: string) => ({ data: answers.get(url), mutate: vi.fn() }),
}))

const { default: store } = await import("@/store/store")
const { PhoneConversationTitle, PhoneHuddleButton } = await import("@/components/navigationBar/mobile/phoneConversationTitle")

const AI = { user_uuid: "ai", user_name: "OneCamp AI", user_full_name: "OneCamp AI", is_bot: true }
const MAYA = { user_uuid: "maya", user_name: "Maya Chen", user_full_name: "Maya Chen" }

const bar = (id: string) =>
  render(
    <Provider store={store}>
      <PhoneConversationTitle kind="dm" id={id} />
      <PhoneHuddleButton kind="dm" id={id} />
    </Provider>,
  )

afterEach(() => {
  cleanup()
  answers.clear()
})

describe("a DM's bar on a phone", () => {
  it("says an agent's role, never where it is, and offers no huddle with it", () => {
    answers.set("/user/profile/ai", { data: AI })
    bar("ai")
    const title = screen.getByRole("button", { name: "OneCamp AI, profile" })
    expect(title.textContent).toContain("Acts for you")
    expect(title.textContent).not.toContain("Offline")
    expect(screen.queryByRole("link", { name: /huddle/i })).toBeNull()
  })

  it("says where a person is, and offers a huddle with them", () => {
    answers.set("/user/profile/maya", { data: MAYA })
    bar("maya")
    expect(screen.getByRole("button", { name: "Maya Chen, profile" }).textContent).toContain("Offline")
    expect(screen.getByRole("link", { name: "Start a huddle" })).toBeTruthy()
  })

  it("offers no huddle before it knows who the DM is with", () => {
    bar("maya")
    expect(screen.queryByRole("link", { name: /huddle/i })).toBeNull()
  })
})
