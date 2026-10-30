import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render } from "@testing-library/react"
import { Provider } from "react-redux"

// The owner: the "/" menu must show installed apps' commands in every case.
// Built-ins come first in the catalog, and the first ten of them filled "/"
// with nothing typed, so an installed app's command showed only once its name
// was typed. And an app that isn't set up gave an admin a command that only
// answered "an admin has to add a key".

vi.mock("@/services/commandService", () => ({
  executeCommand: async () => ({}),
  fetchCommandCatalog: async () => ({ commands: [] }),
  interactCommand: async () => ({}),
  newTriggerID: () => "trigger-1",
}))
const BUILTINS = ["active", "apps", "ask", "away", "collapse", "dm", "dnd", "expand", "feedback", "me", "msg", "poll", "remind", "search", "shortcuts", "shrug", "status"]
const CATALOG = [
  ...BUILTINS.map((command) => ({ command, description: `The ${command} command`, usage_hint: "", is_builtin: true })),
  { command: "giphy", description: "Search and send a GIF", usage_hint: "<search term>", is_builtin: true, setup: { slug: "giphy", name: "Giphy" } },
  { command: "standup", description: "Post a reminder of today's standup", usage_hint: "", is_builtin: false, app_slug: "standup-bot", app_name: "Standup Bot" },
  { command: "zoom", description: "Start a Zoom meeting", usage_hint: "", is_builtin: false, app_slug: "zoom", app_name: "Zoom" },
]
vi.mock("swr", () => ({ default: () => ({ data: { commands: CATALOG } }) }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }))

const { default: store } = await import("@/store/store")
const { default: CommandSurface } = await import("@/components/command/CommandSurface")
const { slashCommandSuggestion, CHAT_COMMANDS } = await import("@/components/minimal-tiptap/extensions/slash-command/slashCommand")

const ID = "c0ffee00-0000-4000-8000-00000000003c"
const editor = () => ({
  view: { dom: document.querySelector(`[data-editor="${ID}"]`) },
  chain: () => ({ focus: () => ({ deleteRange: () => ({ run: () => true, insertContent: () => ({ run: () => true }) }) }) }),
})
const menu = (query: string) => slashCommandSuggestion.items({ query, commands: CHAT_COMMANDS, editor: editor() })

function mount() {
  render(
    <Provider store={store}>
      <section>
        <CommandSurface surfaceKey={ID} channelId={ID} />
        <div className="ProseMirror" data-editor={ID} contentEditable />
      </section>
    </Provider>,
  )
}

afterEach(cleanup)

describe("the / menu and the workspace's apps", () => {
  it("lists an installed app's command with nothing typed, ahead of the built-ins", () => {
    mount()
    const titles = menu("").map((i) => i.title)
    expect(titles).toContain("/standup")
    expect(titles.indexOf("/standup")).toBeLessThan(titles.indexOf("/active"))
  })

  // CODE-REVIEWER-22's probe: apps came first for a typed query too, so with
  // Zoom installed "/me" offered /zoom first ("Start a Zoom meeting" holds
  // "me"), and Enter ran it.
  it("puts the command typed by name first, ahead of an app that only mentions it", () => {
    mount()
    expect(menu("me")[0]?.id).toBe("cmd-me")
    expect(menu("remind")[0]?.id).toBe("cmd-remind")
  })

  it("offers an admin to set up an app that isn't set up, and opens it in Admin › Apps", () => {
    mount()
    const row = menu("gi").find((i) => i.id === "cmd-giphy")
    expect(row?.title).toBe("Set up Giphy")
    const opened = vi.fn()
    window.addEventListener("open-apps", opened)
    act(() => row!.command({ editor: editor(), range: { from: 0, to: 0 } }))
    window.removeEventListener("open-apps", opened)
    expect(opened).toHaveBeenCalledTimes(1)
    expect((opened.mock.calls[0][0] as CustomEvent).detail).toEqual({ slug: "giphy" })
  })
})
