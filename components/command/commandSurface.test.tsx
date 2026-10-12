import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render } from "@testing-library/react"
import { Provider } from "react-redux"

// FE-BUG-11: a slash command ran in every conversation on screen. The composer
// fired one window-wide event with no target, and every mounted command runner
// ran it with its own conversation: with #launch and #finance side by side,
// /poll in #launch posted the poll in both and /remind set two reminders. And
// one provider fed every composer's "/", so closing a pane took the commands
// of the conversation beside it away. A command now runs once, in the
// conversation whose composer sent it.

type Ran = { command: string; channel_id?: string; dm_group_id?: string }
const ran = vi.fn<(req: Ran) => Promise<object>>(async () => ({}))
vi.mock("@/services/commandService", () => ({
  executeCommand: (req: Ran) => ran(req),
  fetchCommandCatalog: async () => ({ commands: [] }),
  interactCommand: async () => ({}),
  newTriggerID: () => "trigger-1",
}))
const CATALOG = [
  { command: "poll", description: "Ask a question", usage_hint: '"question" "option"', is_builtin: true },
  { command: "shortcuts", description: "Keyboard shortcuts", usage_hint: "", is_builtin: true },
]
vi.mock("swr", () => ({ default: () => ({ data: { commands: CATALOG } }) }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }))

const { default: store } = await import("@/store/store")
const { default: CommandSurface } = await import("@/components/command/CommandSurface")
const { maybeDispatchSlashCommand, commandSurfaceOf, slashCommandSuggestion, CHAT_COMMANDS } = await import(
  "@/components/minimal-tiptap/extensions/slash-command/slashCommand"
)

const LAUNCH = "c0ffee00-0000-4000-8000-00000000001a"
const FINANCE = "c0ffee00-0000-4000-8000-00000000002b"

/** A conversation view as the app lays one out: its CommandSurface, then its composer beside it. */
function Conversation({ id }: { id: string }) {
  return (
    <section>
      <CommandSurface surfaceKey={id} channelId={id} />
      <div className="composer">
        <div className="ProseMirror" data-editor={id} contentEditable />
      </div>
    </section>
  )
}

const editorIn = (id: string) => ({ view: { dom: document.querySelector(`[data-editor="${id}"]`) } })
/** What the "/" menu's item does when picked in a composer: the editor it was picked in. */
const pick = (title: string, id: string) => {
  const editor = { ...editorIn(id), chain: () => ({ focus: () => ({ deleteRange: () => ({ run: () => true, insertContent: () => ({ run: () => true }) }) }) }) }
  const item = slashCommandSuggestion.items({ query: title.slice(1), commands: CHAT_COMMANDS, editor }).find((i) => i.title === title)
  if (!item) throw new Error(`${title} isn't offered in ${id}`)
  act(() => item.command({ editor, range: { from: 0, to: 0 } }))
}

beforeEach(() => ran.mockClear())
afterEach(cleanup)

describe("a slash command with two conversations side by side", () => {
  const sideBySide = () =>
    render(
      <Provider store={store}>
        <Conversation id={LAUNCH} />
        <Conversation id={FINANCE} />
      </Provider>,
    )

  it("finds the conversation its composer is in", () => {
    sideBySide()
    expect(commandSurfaceOf(editorIn(LAUNCH))).toBe(LAUNCH)
    expect(commandSurfaceOf(editorIn(FINANCE))).toBe(FINANCE)
  })

  it("runs a typed command once, in the conversation it was typed in", async () => {
    sideBySide()
    await act(async () => void maybeDispatchSlashCommand('/poll "Lunch?" "Yes" "No"', {}, commandSurfaceOf(editorIn(LAUNCH))))
    expect(ran).toHaveBeenCalledTimes(1)
    expect(ran.mock.calls[0][0]).toMatchObject({ command: "poll", channel_id: LAUNCH })
  })

  it("runs a command picked from the menu once, in the conversation it was picked in", () => {
    sideBySide()
    pick("/shortcuts", FINANCE)
    expect(ran).toHaveBeenCalledTimes(1)
    expect(ran.mock.calls[0][0]).toMatchObject({ command: "shortcuts", channel_id: FINANCE })
  })

  it("keeps a conversation's commands when the one beside it closes", () => {
    const view = render(
      <Provider store={store}>
        <Conversation id={LAUNCH} />
      </Provider>,
    )
    const pane = render(
      <Provider store={store}>
        <Conversation id={FINANCE} />
      </Provider>,
    )
    pane.unmount()
    pick("/shortcuts", LAUNCH)
    expect(ran.mock.calls[0][0]).toMatchObject({ channel_id: LAUNCH })
    view.unmount()
  })

  it("runs a command once when the same conversation is open twice", async () => {
    render(
      <Provider store={store}>
        <Conversation id={LAUNCH} />
        <Conversation id={LAUNCH} />
      </Provider>,
    )
    await act(async () => void maybeDispatchSlashCommand("/shortcuts", {}, LAUNCH))
    expect(ran).toHaveBeenCalledTimes(1)
  })

  it("leaves a command typed outside every conversation to be sent as text", () => {
    sideBySide()
    expect(maybeDispatchSlashCommand("/shortcuts", {}, null)).toBe(false)
    expect(ran).not.toHaveBeenCalled()
  })
})
