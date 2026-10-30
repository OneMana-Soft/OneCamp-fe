import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { Provider } from "react-redux"
import { configureStore, type UnknownAction } from "@reduxjs/toolkit"
import { SWRConfig } from "swr"

// The conversation body (chat A1 step 2) is the one place a channel, a DM and
// a group are sent from: a kind supplies only what is its own. A made-up kind
// shows the body uses nothing else: the row it draws while sending, the draft
// it empties, the end it follows, the first message it celebrates, and the
// pages it is given.

const post = vi.fn((...args: unknown[]) => new Promise(() => void args))
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { post: (...args: unknown[]) => post(...args) } }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock("@/hooks/useScheduledMessages", () => ({ useScheduleMessage: () => vi.fn() }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))
vi.mock("@/hooks/useFetch", () => ({ useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "me", user_name: "Sam Rivera" } } }) }))
vi.mock("@/hooks/useConversationMissing", () => ({ useConversationMissing: () => ({ missing: null, retry: vi.fn(), retrying: false }) }))
vi.mock("@/hooks/useComposeOnArrival", () => ({ useComposeOnArrival: () => true }))
vi.mock("@/hooks/useLinkTarget", () => ({ useInSplitPane: () => false }))

const { ConversationBody } = await import("@/components/conversation/ConversationBody")
type Kind = import("@/components/conversation/ConversationBody").ConversationKind<Row, { text: string }, { uuid: string }>
type PageProps = import("@/components/conversation/ConversationBody").ConversationPageProps

type Row = { id: string; text: string; by?: string }
let held: Row[] = []
let draft = { inputTextHTML: "<p>Hi</p>", filesUploaded: [], filePreview: [] }
const seen: UnknownAction[] = []
const firsts: boolean[] = []
let given: Omit<PageProps, "handleSend"> | null = null

const Page = ({ handleSend, ...rest }: PageProps) => {
  given = rest
  return <button onClick={() => firsts.push(handleSend() === true)}>Send</button>
}

const kind: Kind = {
  kind: "group",
  id: "g1",
  missing: { noun: "conversation", back: { label: "Back to messages", href: "/app/chat" } },
  latestKey: "/latest/g1",
  linkParam: "messageId",
  pending: {
    endpoint: "/send",
    add: (row) => ({ type: "test/add", payload: row }),
    confirm: (localId) => ({ type: "test/confirm", payload: localId }),
    fail: (localId) => ({ type: "test/fail", payload: localId }),
    retry: (localId) => ({ type: "test/retry", payload: localId }),
    remove: (localId) => ({ type: "test/remove", payload: localId }),
    find: () => undefined,
    payloadOf: (row) => ({ text: row.text }),
    draftOf: (row) => ({ html: row.text, files: [], previews: [] }),
    restore: (unsent) => ({ type: "test/restore", payload: unsent }),
  },
  draftOf: () => draft,
  clearDraft: { type: "test/clear" },
  bodyOf: ({ html }) => ({ text: html }),
  sending: (localId, { html, self }) => ({ id: localId, text: html, by: self.user_uuid }),
  hasMine: (_state, self) => held.some((r) => r.by === self),
  schedule: { kind: "group", target: "g1" },
  afterSend: { type: "test/follow" },
  pages: { computer: Page, phone: Page },
}

function draw(hasMore = false) {
  const store = configureStore({ reducer: (state: object = {}, action: UnknownAction) => (seen.push(action), state) })
  const cache = new Map<string, unknown>([["/latest/g1", { data: { data: { has_more: hasMore } } }]])
  render(
    <SWRConfig value={{ provider: () => cache as never }}>
      <Provider store={store}>
        <ConversationBody kind={kind} />
      </Provider>
    </SWRConfig>,
  )
}
const types = () => seen.map((a) => a.type).filter((t) => t.startsWith("test/"))

beforeEach(() => {
  held = []
  draft = { inputTextHTML: "<p>Hi</p>", filesUploaded: [], filePreview: [] }
  seen.length = 0
  firsts.length = 0
  given = null
  post.mockClear()
  localStorage.clear()
})
afterEach(cleanup)

describe("the conversation body sends through its kind", () => {
  it("draws the kind's row while it sends, empties the draft and follows the end", () => {
    draw()
    fireEvent.click(screen.getByText("Send"))
    expect(types()).toEqual(["test/clear", "test/add", "test/follow"])
    const added = seen.find((a) => a.type === "test/add") as UnknownAction & { payload: Row }
    expect(added.payload).toMatchObject({ text: "<p>Hi</p>", by: "me" })
    expect(post).toHaveBeenCalledWith("/send", { text: "<p>Hi</p>" }, expect.anything())
  })

  it("sends nothing from an empty box", () => {
    draft = { inputTextHTML: "<p></p>", filesUploaded: [], filePreview: [] }
    draw()
    fireEvent.click(screen.getByText("Send"))
    expect(types()).toEqual([])
    expect(post).not.toHaveBeenCalled()
  })

  it("celebrates the first message only when none held is yours and the whole history is loaded", () => {
    draw()
    fireEvent.click(screen.getByText("Send"))
    cleanup()
    localStorage.clear()
    held = [{ id: "m1", text: "Earlier", by: "me" }]
    draw()
    fireEvent.click(screen.getByText("Send"))
    cleanup()
    localStorage.clear()
    held = []
    draw(true)
    fireEvent.click(screen.getByText("Send"))
    expect(firsts).toEqual([true, false, false])
  })

  // The count it opened with goes to the list and the catch-up banner alone
  // (components/conversation/openCount), never through the page.
  it("gives the kind's page the conversation and the focus", () => {
    draw()
    expect(given).toEqual({ id: "g1", focusComposer: true })
  })
})
