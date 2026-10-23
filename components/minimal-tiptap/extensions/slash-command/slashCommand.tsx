import { CommandList, CommandTile, fuzzyMatch, type CommandListHandle, type CommandListItem } from "@/components/ui/CommandList"
import { SuggestionKeyDownProps, SuggestionProps } from "@tiptap/suggestion"
import React, { forwardRef, useImperativeHandle, useRef } from "react"
import { suggestionPopup, type SuggestionListExtras } from "../suggestion-popup"
import { busFor } from "@/components/docEditor/registry/commandBus"
import { storedRecents } from "@/lib/utils/storedRecents"
import { Code, Sparkles, Bold, Italic, Strikethrough, Zap } from "@/lib/icons";
import { Underline as UnderlineIcon, Eraser } from "@/lib/icons";

export interface SlashCommandItem {
  id: string
  title: string
  description: string
  icon: React.ElementType
  section: string
  /** The markdown shortcut that makes the same block, shown as kbd chips. */
  kbd?: string[]
  /** Other words it answers to ("img", "todo", "h1", "#", "div"), as Notion's do. */
  aliases?: string[]
  command: (props: { editor: any; range: any }) => void
}

// ─── Text formatting (safe everywhere: chat, comments, docs) ───
const FORMAT_COMMANDS: SlashCommandItem[] = [
  {
    id: "bold",
    aliases: ["strong", "b"],
    title: "Bold",
    description: "Make text bold",
    icon: Bold,
    section: "Format",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBold().run()
    },
  },
  {
    id: "italic",
    aliases: ["emphasis", "i"],
    title: "Italic",
    description: "Make text italic",
    icon: Italic,
    section: "Format",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleItalic().run()
    },
  },
  {
    id: "underline",
    aliases: ["u"],
    title: "Underline",
    description: "Underline text",
    icon: UnderlineIcon,
    section: "Format",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleUnderline().run()
    },
  },
  {
    id: "strikethrough",
    aliases: ["strike", "s", "~"],
    title: "Strikethrough",
    description: "Cross out text",
    icon: Strikethrough,
    section: "Format",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleStrike().run()
    },
  },
  {
    id: "inlineCode",
    aliases: ["code", "mono"],
    title: "Inline code",
    description: "Format text as inline code",
    icon: Code,
    section: "Format",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleCode().run()
    },
  },
  {
    id: "clearFormatting",
    aliases: ["clear", "unformat", "plain"],
    title: "Clear formatting",
    description: "Remove all text formatting",
    icon: Eraser,
    section: "Format",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).unsetAllMarks().run()
    },
  },
]

/**
 * Chat, comments, channel posts, task descriptions: only formatting. A doc's
 * "/" comes from the block registry (registry/readers.ts slashItemsFor): its
 * blocks, and behind the AI gate its AI items; registry tests hold these to
 * the registry's own formatting items.
 */
export const CHAT_COMMANDS: SlashCommandItem[] = [
  ...FORMAT_COMMANDS,
]

// ─── Backend command provider (Slack-style app/core commands) ───
//
// The chat composer registers an async provider that returns the scoped
// command catalog (/remind, /giphy, /poll, ...). These are merged into the
// "/" menu alongside the formatting commands above. Selecting one dispatches
// a `chat-slash-command` CustomEvent, which the composer's command runner
// handles (execute server-side, render an interactive card, or perform a
// client action). A doc's own items (AI among them) are registered actions run
// through its command bus instead (components/docEditor/registry). Keeping this as a module-level provider avoids threading async
// props through every composer while ensuring docs (which never register a
// provider) keep their formatting-only menu unchanged.

export interface BackendCommandEntry {
  command: string        // canonical name without leading slash
  description: string
  usage_hint?: string
  app_name?: string
  icon_url?: string
  is_builtin: boolean
}

type BackendCommandProvider = (query: string) => BackendCommandEntry[]

// By surface: a composer's commands are its conversation's (FE-BUG-11).
const backendCommandProviders = new Map<string, BackendCommandProvider>()

const providerFor = (surface?: string | null) => backendCommandProviders.get(surface || "")
const SURFACE = "data-command-surface"

/** A composer's surface: data-command-surface on, or beside, an ancestor. */
type SurfaceEditor = { view?: { dom?: Element | null } } | null

export function commandSurfaceOf(editor?: SurfaceEditor): string | null {
  for (let el = editor?.view?.dom; el; el = el.parentElement) {
    const at = el.hasAttribute(SURFACE) ? el : el.querySelector(`:scope > [${SURFACE}]`)
    if (at) return at.getAttribute(SURFACE)
  }
  return null
}

// slashMenuOpen tracks whether the "/" suggestion popup is currently showing.
// The composer's Enter-to-send handler reads this (via isSlashMenuOpen) and
// yields while the menu is open so Enter selects the highlighted command
// instead of sending the raw "/" text as a message. Set by the render
// lifecycle below — deterministic, no ProseMirror plugin-key guesswork.
let slashMenuOpen = false

/** isSlashMenuOpen reports whether the "/" command menu is currently visible. */
export function isSlashMenuOpen(): boolean {
  return slashMenuOpen
}

/** Registers a surface's provider (null removes it); returns its removal. */
export function setBackendCommandProvider(provider: BackendCommandProvider | null, surface = "") {
  if (provider) backendCommandProviders.set(surface, provider)
  else backendCommandProviders.delete(surface)
  return () => {
    if (provider && backendCommandProviders.get(surface) === provider) backendCommandProviders.delete(surface)
  }
}

/** Map a backend catalog entry to a SlashCommandItem that dispatches an event. */
function toBackendItem(entry: BackendCommandEntry): SlashCommandItem {
  const hint = entry.usage_hint ? ` ${entry.usage_hint}` : ""
  return {
    id: `cmd-${entry.command}`,
    title: `/${entry.command}${hint}`,
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

/**
 * resolveBackendCommandName returns the canonical command name when `query`
 * exactly matches an installed/scoped backend command (case-insensitive), or
 * null otherwise. Used by the composer's send-time interception to decide
 * whether a leading-slash message is a command to run vs plain text to post.
 */
function resolveBackendCommandName(query: string, surface: string | null): string | null {
  const provider = providerFor(surface)
  if (!provider) return null
  const name = (query || "").trim().toLowerCase()
  if (!name) return null
  try {
    const entries = provider(name)
    const exact = entries.find((e) => e.command.toLowerCase() === name)
    return exact ? exact.command : null
  } catch {
    return null
  }
}

/**
 * maybeDispatchSlashCommand inspects the composer's plain text at send time.
 * If it's `/<known-command> [args]`, it dispatches the `chat-slash-command`
 * event (handled by the surface's command runner) and returns true so the
 * caller skips the normal message send. Returns false for plain text or an
 * unknown command (which should post as a normal message).
 *
 * `mentions` maps a display label (lowercased, no "@") to the real user UUID,
 * extracted from the composer's mention nodes — so a command like
 * "/dm @Akash hi" can resolve @Akash to the exact UUID the user picked instead
 * of fuzzy-matching the display name. The runner forwards it in the event.
 */
export function maybeDispatchSlashCommand(
  plainText: string,
  mentions?: Record<string, string>,
  surface: string | null = null,
): boolean {
  const text = (plainText || "").trim()
  if (!text.startsWith("/")) return false
  const afterSlash = text.slice(1)
  const name = afterSlash.split(/\s+/)[0] || ""
  const resolved = resolveBackendCommandName(name, surface)
  if (!resolved) return false
  // `typed` carries the command name + args (no leading slash); the runner
  // strips the command token to get the argument text.
  window.dispatchEvent(
    new CustomEvent("chat-slash-command", {
      detail: { command: resolved, typed: afterSlash, mentions: mentions || {}, surface },
    }),
  )
  return true
}

/**
 * extractSlashCommandFromEditor reads the editor's structured doc and returns
 * the composer's plain text PLUS a label→uuid map built from mention nodes.
 * Mention nodes render as "@username" in plain text (losing the id), so we walk
 * the doc to recover each mention's data-id (formatted "<uuid>@<dgraphUid>") and
 * key it by the lowercased label. Returns null when there's nothing to send.
 */
export function extractSlashCommandFromEditor(editor: {
  getText: () => string
  state: { doc: { descendants: (cb: (node: NodeLike) => void) => void } }
}): { text: string; mentions: Record<string, string> } | null {
  if (!editor) return null
  const text = editor.getText().trim()
  if (!text) return null
  const mentions: Record<string, string> = {}
  try {
    editor.state.doc.descendants((node: NodeLike) => {
      if (node.type?.name === "mention" && node.attrs) {
        const rawId = String(node.attrs.id || "")
        const label = String(node.attrs.label || "").trim().toLowerCase()
        // id is "<uuid>@<dgraphUid>"; the UUID is the part before "@".
        const uuid = rawId.split("@")[0]
        if (label && uuid) mentions[label] = uuid
      }
    })
  } catch {
    /* structured walk failed — fall back to text-only */
  }
  return { text, mentions }
}

interface NodeLike {
  type?: { name?: string }
  attrs?: { id?: unknown; label?: unknown }
}

/**
 * How well an item answers what was typed after "/": its name, then the other
 * words it answers to (aliases, from their start), then words in its name,
 * then words in its description, then the letters of its name in order. 0 is
 * no match. Pure.
 */
export function slashScore(item: SlashCommandItem, query: string): number {
  const q = query.trim().toLowerCase()
  if (!q) return 1
  const title = item.title.toLowerCase()
  const aliases = (item.aliases ?? []).map((a) => a.toLowerCase())
  if (title === q || aliases.includes(q)) return 100
  if (title.startsWith(q)) return 90
  if (aliases.some((a) => a.startsWith(q))) return 85
  if (title.split(/[\s-]+/).some((w) => w.startsWith(q))) return 75
  if (item.id.toLowerCase().startsWith(q)) return 70
  if (title.includes(q)) return 60
  if (item.description.toLowerCase().split(/[^a-z0-9]+/).some((w) => w.startsWith(q))) return 40
  // Letters in order ("hdg" for Heading) only from three on: two letters
  // in order match half the menu.
  if (q.length >= 3 && fuzzyMatch(title, q)) return 20
  return 0
}

/** The most commands a chat composer's provider adds to the menu. */
const BACKEND_LIMIT = 50

export const slashCommandSuggestion = {
  /**
   * What "/" offers for a query. Tiptap's query is what follows the "/", so
   * all of it counts: the first letter used to be cut off, so "/img" and
   * "/todo" found nothing and "/he" listed everything. Every match is
   * offered, best first (the list scrolls): a cap of 16 used to hide the AI
   * items and the last formatting ones.
   */
  items: ({ query, commands, editor }: { query: string; commands: SlashCommandItem[]; editor?: SurfaceEditor }): SlashCommandItem[] => {
    const q = (query || "").trim().toLowerCase()

    // Merge backend (app/core) commands when a provider is registered (chat
    // composer). Docs register no provider, so their menu is unchanged.
    let backendItems: SlashCommandItem[] = []
    const provider = providerFor(commandSurfaceOf(editor))
    if (provider) {
      try {
        backendItems = provider(q).slice(0, BACKEND_LIMIT).map(toBackendItem)
      } catch {
        backendItems = []
      }
    }

    if (!q) return [...backendItems, ...commands]
    const ranked = commands
      .map((item, at) => ({ item, at, score: slashScore(item, q) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score || a.at - b.at)
      .map((r) => r.item)
    return [...backendItems, ...ranked]
  },

  render: suggestionPopup({
    component: forwardRef<SlashRef, SlashProps>(function SlashMenu(props, ref) {
      return <SlashCommandList {...props} ref={ref} />
    }),
    // The chat composer's Enter yields while the menu is up (isSlashMenuOpen).
    onOpenChange: (open) => {
      slashMenuOpen = open
    },
  }),
}

type SlashRef = {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean
}

interface SlashProps extends SuggestionProps, SuggestionListExtras {
  items: SlashCommandItem[]
}

const SECTION_ORDER = ["Commands", "Recent", "Basic", "Media and embeds", "AI", "Format"]

/** Media and embeds wear their kind's camp tint (as their embed cards do). */
const MEDIA_TILE: Record<string, string> = {
  table: "bg-camp-moss-tint text-camp-moss-ink ring-0",
  image: "bg-camp-sky-tint text-camp-sky-ink ring-0",
  callout: "bg-camp-sun-tint text-camp-sun-ink ring-0",
}

/** The last three blocks someone inserted, newest first (per browser). */
const recentBlocks = storedRecents<string>("onecamp-slash-recent", 3, {
  valid: (id): id is string => typeof id === "string",
  same: (a, b) => a === b,
})

/**
 * The slash menu (content.md D09), as the area's CommandList: grouped
 * Recent, Basic, Media and embeds, AI (then Format); 24 px tiles (AI's on the
 * agent tint), markdown shortcuts as kbd chips, the highlighted row's
 * description in the footer, and one sliding highlight. With no match in a
 * doc it offers "Ask AI to write …" instead of an empty box.
 */
const SlashCommandList = forwardRef<SlashRef, SlashProps>((props, ref) => {
  const listRef = useRef<CommandListHandle>(null)
  const query = (props.query || "").replace(/^\//, "")
  const slash = props.editor?.extensionManager?.extensions?.find((e: { name: string }) => e.name === "slash-command")?.options
  // A doc's menu is the one configured with AI commands; ask the extension,
  // since the matched items are empty exactly when this matters.
  const inDoc = !!slash?.commands?.some((c: SlashCommandItem) => c.section === "AI")
  // A chat composer's menu leads with its commands (/remind, /poll): it says
  // so, where it read "Blocks" (MC-13). A doc's stays a block menu. Decided as
  // the extension decides its rows (SlashCommand's conversation): the header
  // read "Commands" over formatting alone while the rows were left out.
  const commands = !!slash?.conversation && !!providerFor(commandSurfaceOf(props.editor))

  const ordered = React.useMemo(() => {
    if (query) {
      // Ranked (items, best first), grouped: a group comes where its best
      // match does, so the highlighted first row is the best one.
      const groups: string[] = []
      for (const i of props.items) if (!groups.includes(i.section)) groups.push(i.section)
      return groups.flatMap((section) => props.items.filter((i) => i.section === section).map((i) => ({ item: i, group: section })))
    }
    const recentIds = recentBlocks.read()
    const recent = recentIds.map((id) => props.items.find((i) => i.id === id)).filter(Boolean) as SlashCommandItem[]
    const rest = SECTION_ORDER.flatMap((section) => props.items.filter((i) => i.section === section))
    const unknown = props.items.filter((i) => !SECTION_ORDER.includes(i.section))
    return [...recent.map((i) => ({ item: i, group: "Recent" })), ...[...rest, ...unknown].map((i) => ({ item: i, group: i.section }))]
  }, [props.items, query])

  const items: CommandListItem[] = React.useMemo(
    () =>
      ordered.map(({ item, group }) => {
        const Icon = item.icon
        const ai = item.section === "AI"
        return {
          id: `${group}:${item.id}`,
          label: item.title,
          group,
          description: item.description,
          kbd: item.kbd,
          tile: (
            <CommandTile className={ai ? "bg-agent-muted text-agent-ink ring-0" : MEDIA_TILE[item.id]}>
              <Icon />
            </CommandTile>
          ),
        }
      }),
    [ordered],
  )

  const select = (id: string) => {
    const entry = ordered.find(({ item, group }) => `${group}:${item.id}` === id)
    if (!entry) return
    if (entry.item.section !== "Commands") recentBlocks.note(entry.item.id)
    entry.item.command({ editor: props.editor, range: props.range })
  }

  const askAI = () => {
    props.editor.chain().focus().deleteRange(props.range).run()
    // The doc this menu is in, alone (split view shows two).
    busFor(props.editor)?.emit("aiRun", { action: "write", prompt: query })
  }

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: SuggestionKeyDownProps) => {
      if (!items.length && inDoc && query && event.key === "Enter") {
        askAI()
        return true
      }
      return listRef.current?.onKeyDown(event) ?? false
    },
  }))

  return (
    <div data-slash-menu="">
    <CommandList
      ref={listRef}
      comboboxFor={props.comboboxFor}
      label={commands ? "Commands" : "Insert a block"}
      header={query ? `/ ${query}` : commands ? "Commands" : "Blocks"}
      query={query}
      items={items}
      footer={items.length > 0}
      maxHeight={360}
      groupIcons={{ AI: <Sparkles /> }}
      onSelect={(item) => select(item.id)}
      empty={
        inDoc && query ? (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={askAI}
            className="-mx-1 -my-2 flex h-8 w-[calc(100%+8px)] items-center gap-2.5 rounded-lg bg-press px-2 text-left text-ui text-ink"
          >
            <CommandTile className="bg-agent-muted text-agent-ink ring-0">
              <Sparkles />
            </CommandTile>
            <span className="min-w-0 truncate">Ask AI to write “{query}”</span>
          </button>
        ) : (
          <span className="text-ink-3">No {commands ? "command" : "block"} called “{query}”</span>
        )
      }
    />
    </div>
  )
})

SlashCommandList.displayName = "SlashCommandList"
