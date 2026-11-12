import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

// AN EMPTY DM OFFERS ONLY WHAT CAN RUN (UX-CHAT-H2, the audit's CHAT-22). Its
// "Start a huddle" chip was drawn whatever the server could do: on a
// workspace with no call server every header's Huddle is hidden
// (FeatureGate FEATURE_CALLS), and the chip opened a call page that could
// never connect. It was offered to a plain automated account too, which no
// one can call (mayCallPeer), and before the person had loaded.

const state = vi.hoisted(() => ({ calls: true, other: undefined as Record<string, unknown> | undefined }))
vi.mock("@/hooks/useClientConfig", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/hooks/useClientConfig")>()
  return {
    ...real,
    useFeature: (name: string) => name === real.FEATURE_CALLS && state.calls,
    useClientConfig: () => ({ features: { [real.FEATURE_CALLS]: state.calls } }),
  }
})
vi.mock("@/hooks/useFetch", () => ({
  useFetch: () => ({ data: undefined }),
  useFetchOnlyOnce: () => ({ data: state.other ? { data: state.other } : undefined }),
}))
vi.mock("@/hooks/useBotKinds", () => ({ useBotKindMap: () => ({}), useBotKind: () => undefined }))
vi.mock("react-redux", () => ({ useDispatch: () => vi.fn(), useSelector: () => undefined }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock("@/components/message/chatFace", () => ({ ChatFace: () => null }))

const { DmEmpty } = await import("./emptyConversations")

const MAYA = { user_uuid: "5b1d7c2e-8f3a-4d6b-9e0c-1a2b3c4d5e6f", user_name: "Maya Chen", user_full_name: "Maya Chen" }
// A plain automated account (a webhook's): a bot, but not an AI agent, so its DM is a DM's.
const DEPLOYS = { user_uuid: "6c2e8d3f-9a4b-4e7c-8f1d-2b3c4d5e6f70", user_name: "Deploys", user_full_name: "Deploys", is_bot: true }

afterEach(() => {
  cleanup()
  state.calls = true
  state.other = undefined
})

const huddle = () => screen.queryByRole("button", { name: "Start a huddle" })

describe("an empty DM's starters", () => {
  it("an empty DM offers Start a huddle only where calls run, and never to an agent", () => {
    state.other = MAYA
    render(<DmEmpty chatId={MAYA.user_uuid} />)
    expect(screen.getByRole("button", { name: "Say hello to Maya" })).toBeTruthy()
    expect(huddle()).toBeTruthy()
    cleanup()

    // No call server: the headers hide Huddle, and so does the starter.
    state.calls = false
    render(<DmEmpty chatId={MAYA.user_uuid} />)
    expect(screen.getByRole("button", { name: "Say hello to Maya" })).toBeTruthy()
    expect(huddle()).toBeNull()
    cleanup()

    // An automated account can't be called, calls or not.
    state.calls = true
    state.other = DEPLOYS
    render(<DmEmpty chatId={DEPLOYS.user_uuid} />)
    expect(screen.getByRole("button", { name: "Say hello to Deploys" })).toBeTruthy()
    expect(huddle()).toBeNull()
  })

  it("offers no huddle before it knows who the DM is with", () => {
    render(<DmEmpty chatId={MAYA.user_uuid} />)
    expect(screen.getByRole("button", { name: "Say hello" })).toBeTruthy()
    expect(huddle()).toBeNull()
  })
})
