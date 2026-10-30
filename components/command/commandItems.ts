import { Zap } from "@/lib/icons"
import type { CommandSetup } from "@/types/command"
import {
  commandSurfaceOf,
  setBackendCommands,
  slashScore,
  type SlashCommandItem,
} from "@/components/minimal-tiptap/extensions/slash-command/slashCommand"

// A chat composer's commands as "/" menu rows. Only a composer's command runner
// reaches this module, so a doc's route carries none of it (a doc registers no
// commands; CR-31 MF1, the doc route's source ceiling).

export interface BackendCommandEntry {
  command: string        // canonical name without leading slash
  description: string
  usage_hint?: string
  app_name?: string
  icon_url?: string
  is_builtin: boolean
  setup?: CommandSetup
}

export type BackendCommandProvider = (query: string) => BackendCommandEntry[]

/** Map a backend catalog entry to a SlashCommandItem that dispatches an event. */
function toBackendItem(entry: BackendCommandEntry): SlashCommandItem {
  if (entry.setup) {
    // An admin's row for an app that isn't set up yet (members don't see the
    // command): it opens the app in Admin › Apps rather than answering "an
    // admin has to add a key".
    const { slug, name } = entry.setup
    return {
      id: `cmd-${entry.command}`,
      title: `Set up ${name}`,
      aliases: [entry.command],
      description: `/${entry.command} · members see it once it's set up`,
      icon: Zap,
      section: "Commands",
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).run()
        window.dispatchEvent(new CustomEvent("open-apps", { detail: { slug } }))
      },
    }
  }
  const hint = entry.usage_hint ? ` ${entry.usage_hint}` : ""
  return {
    id: `cmd-${entry.command}`,
    title: `/${entry.command}${hint}`,
    // Its name, so typing it scores as typing any item's name: the "/" in
    // front of the title kept it at "contains".
    aliases: [entry.command],
    description: entry.app_name ? `${entry.description} · ${entry.app_name}` : entry.description,
    icon: Zap,
    section: "Commands",
    command: ({ editor, range }) => {
      // Slack/Notion-grade UX:
      //  • A command that needs arguments → insert "/command " into the
      //    composer and leave the cursor after it, so the user types the args
      //    and presses Enter (send-time interception then runs it).
      //  • A no-argument command (e.g. /active, /shortcuts) → run immediately,
      //    so a single click does the thing — no second keystroke.
      if (commandNeedsArgs(entry.usage_hint)) {
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .insertContent(`/${entry.command} `)
          .run()
        return
      }
      editor.chain().focus().deleteRange(range).run()
      window.dispatchEvent(
        new CustomEvent("chat-slash-command", {
          detail: { command: entry.command, typed: entry.command, surface: commandSurfaceOf(editor) },
        }),
      )
    },
  }
}

// commandNeedsArgs decides whether selecting a command should wait for the user
// to type arguments (insert "/command ") vs run immediately. A usage hint that
// contains a required placeholder ("<...>"), a mention/channel token ("@"/"#"),
// or a quoted example ('"') means the command expects input. Empty or
// purely-optional hints ("[name]") run immediately.
function commandNeedsArgs(usageHint?: string): boolean {
  const h = (usageHint || "").trim()
  if (!h) return false
  return /[<@#"]/.test(h)
}

/** The most commands a chat composer's provider adds to the menu. */
const BACKEND_LIMIT = 50

/** The items that answer a typed query, best first; equals keep their order. Pure. */
function ranked(items: SlashCommandItem[], q: string): SlashCommandItem[] {
  return items
    .map((item, at) => ({ item, at, score: slashScore(item, q) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.at - b.at)
    .map((r) => r.item)
}

/** Registers a surface's catalog (null removes it) as finished menu rows; returns its removal. */
export function setBackendCommandProvider(provider: BackendCommandProvider | null, surface = "") {
  return setBackendCommands(
    provider && {
      items: (q) => {
        const items = provider(q).map(toBackendItem)
        return (q ? ranked(items, q) : items).slice(0, BACKEND_LIMIT)
      },
      names: provider,
    },
    surface,
  )
}
