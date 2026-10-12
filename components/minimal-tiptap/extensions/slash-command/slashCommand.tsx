import { CommandList, CommandTile, type CommandListHandle, type CommandListItem } from "@/components/ui/CommandList"
import { ReactRenderer } from "@tiptap/react"
import { SuggestionKeyDownProps, SuggestionProps } from "@tiptap/suggestion"
import React, { forwardRef, useImperativeHandle, useRef } from "react"
import tippy, { Instance as TippyInstance } from "tippy.js"
import { Heading1, Heading2, Heading3, List, ListOrdered, Quote, Code, Minus, CheckSquare, Image, Sparkles, MessageSquare, ChevronRight, Bold, Italic, Strikethrough, Zap } from "@/lib/icons";
import { Lightbulb, Underline as UnderlineIcon, Eraser, Table as TableIcon } from "@/lib/icons";

export interface SlashCommandItem {
  id: string
  title: string
  description: string
  icon: React.ElementType
  section: string
  /** The markdown shortcut that makes the same block, shown as kbd chips. */
  kbd?: string[]
  command: (props: { editor: any; range: any }) => void
}

const DOM_RECT_FALLBACK: DOMRect = {
  bottom: 0, height: 0, left: 0, right: 0, top: 0, width: 0, x: 0, y: 0,
  toJSON() { return {} },
}

// ─── Text formatting (safe everywhere: chat, comments, docs) ───
const FORMAT_COMMANDS: SlashCommandItem[] = [
  {
    id: "bold",
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
    title: "Clear formatting",
    description: "Remove all text formatting",
    icon: Eraser,
    section: "Format",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).unsetAllMarks().run()
    },
  },
]

// ─── Block structure (requires corresponding Tiptap extensions) ───
const STRUCTURE_COMMANDS: SlashCommandItem[] = [
  {
    id: "heading1",
    kbd: ["#"],
    title: "Heading 1",
    description: "Large section heading",
    icon: Heading1,
    section: "Basic",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode("heading", { level: 1 }).run()
    },
  },
  {
    id: "heading2",
    kbd: ["##"],
    title: "Heading 2",
    description: "Medium section heading",
    icon: Heading2,
    section: "Basic",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode("heading", { level: 2 }).run()
    },
  },
  {
    id: "heading3",
    kbd: ["###"],
    title: "Heading 3",
    description: "Small section heading",
    icon: Heading3,
    section: "Basic",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode("heading", { level: 3 }).run()
    },
  },
  {
    id: "bulletList",
    kbd: ["-"],
    title: "Bullet list",
    description: "Create a simple bullet list",
    icon: List,
    section: "Basic",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBulletList().run()
    },
  },
  {
    id: "orderedList",
    kbd: ["1."],
    title: "Numbered list",
    description: "Create a numbered list",
    icon: ListOrdered,
    section: "Basic",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleOrderedList().run()
    },
  },
  {
    id: "taskList",
    kbd: ["[]"],
    title: "Task list",
    description: "Create a task list with checkboxes",
    icon: CheckSquare,
    section: "Basic",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleTaskList().run()
    },
  },
  {
    id: "blockquote",
    kbd: [">"],
    title: "Quote",
    description: "Insert a blockquote",
    icon: Quote,
    section: "Basic",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBlockquote().run()
    },
  },
  {
    id: "codeBlock",
    kbd: ["```"],
    title: "Code block",
    description: "Insert a code block",
    icon: Code,
    section: "Basic",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setCodeBlock().run()
    },
  },
  {
    id: "horizontalRule",
    kbd: ["---"],
    title: "Divider",
    description: "Insert a horizontal divider",
    icon: Minus,
    section: "Basic",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHorizontalRule().run()
    },
  },
]

// ─── Doc-only blocks (require extra extensions: Callout, Collapsible, TaskList, Image) ───
const DOC_BLOCK_COMMANDS: SlashCommandItem[] = [
  {
    id: "callout",
    title: "Callout",
    description: "A highlighted note, warning or idea",
    icon: MessageSquare,
    section: "Basic",
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent({
          type: 'callout',
          content: [{ type: 'paragraph' }],
        })
        .run()
    },
  },
  {
    id: "collapsible",
    title: "Toggle",
    description: "Collapsible section with title",
    icon: ChevronRight,
    section: "Basic",
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent({
          type: 'collapsible',
          content: [{ type: 'paragraph' }],
        })
        .run()
    },
  },
  {
    id: "image",
    title: "Image",
    description: "Upload or embed an image",
    icon: Image,
    section: "Media and embeds",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleImage().run()
    },
  },
  {
    id: "table",
    title: "Table",
    description: "Embed an existing table or create a new one",
    icon: TableIcon,
    section: "Media and embeds",
    command: ({ editor, range }) => {
      // Open the table picker (handled in docInput.tsx): the author can embed
      // a live view of an existing table or create a new one. The doc stores
      // only { tableId }, never the rows (Notion's model).
      editor.chain().focus().deleteRange(range).run()
      window.dispatchEvent(new CustomEvent("doc-embed-table"))
    },
  },
]

// ─── AI assistants — dispatch events captured by docInput.tsx ───
const AI_COMMANDS: SlashCommandItem[] = [
  {
    id: "ai-write",
    title: "Write with AI",
    description: "Generate content from a prompt",
    icon: Sparkles,
    section: "AI",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).run()
      window.dispatchEvent(new CustomEvent('doc-ai-slash', { detail: { action: 'write' } }))
    },
  },
  {
    id: "ai-summarize",
    title: "Summarize with AI",
    description: "Summarize selected text or document",
    icon: Lightbulb,
    section: "AI",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).run()
      window.dispatchEvent(new CustomEvent('doc-ai-slash', { detail: { action: 'summarize' } }))
    },
  },
]

// ─── Assembled palettes ───

/** Chat, comments, channel posts, task descriptions — only formatting */
export const CHAT_COMMANDS: SlashCommandItem[] = [
  ...FORMAT_COMMANDS,
]

/** Full doc editor palette — structure + doc blocks + formatting + AI */
export const DOC_SLASH_COMMANDS: SlashCommandItem[] = [
  ...STRUCTURE_COMMANDS,
  ...DOC_BLOCK_COMMANDS,
  ...FORMAT_COMMANDS,
  ...AI_COMMANDS,
]

/** Legacy export — keep for backward compatibility */
const COMMANDS: SlashCommandItem[] = DOC_SLASH_COMMANDS
const BASE_COMMANDS: SlashCommandItem[] = CHAT_COMMANDS
const DOC_COMMANDS: SlashCommandItem[] = DOC_BLOCK_COMMANDS

// ─── Backend command provider (Slack-style app/core commands) ───
//
// The chat composer registers an async provider that returns the scoped
// command catalog (/remind, /giphy, /poll, ...). These are merged into the
// "/" menu alongside the formatting commands above. Selecting one dispatches
// a `chat-slash-command` CustomEvent — the same decoupled pattern the AI
// commands use (`doc-ai-slash`) — which the composer's command runner handles
// (execute server-side, render an interactive card, or perform a client
// action). Keeping this as a module-level provider avoids threading async
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

// The command providers of the conversations on screen, by surface key: the
// page's, and each split pane's. A composer's "/" and the commands it runs are
// its own conversation's (FE-BUG-11). There was one provider for the app and
// one window-wide event, so with two conversations side by side /poll posted
// in both and /remind set two reminders, and closing a pane took the other's
// commands with it. "" is a provider registered for no surface (a test's).
const backendCommandProviders = new Map<string, BackendCommandProvider>()

const providerFor = (surface: string | null | undefined): BackendCommandProvider | null =>
  backendCommandProviders.get(surface || "") ?? null

/**
 * The command surface a composer belongs to: the key a conversation view's
 * CommandSurface marks beside it (data-command-surface on an element that is,
 * or is a child of, one of the editor's ancestors), or a thread panel's own.
 * Null for an editor outside every surface.
 */
export function commandSurfaceOf(editor: { view?: { dom?: Element | null } } | null | undefined): string | null {
  let el: Element | null | undefined
  try {
    el = editor?.view?.dom
  } catch {
    return null
  }
  for (; el; el = el.parentElement) {
    const own = el.getAttribute("data-command-surface")
    if (own) return own
    const beside = el.querySelector(":scope > [data-command-surface]")
    if (beside) return beside.getAttribute("data-command-surface")
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

/**
 * Registers a conversation's command provider (its command runner does, for
 * its surface key), or removes it (null). Returns the removal, which leaves a
 * provider registered since for the same surface in place.
 */
export function setBackendCommandProvider(provider: BackendCommandProvider | null, surface = ""): () => void {
  if (!provider) {
    backendCommandProviders.delete(surface)
    return () => {}
  }
  backendCommandProviders.set(surface, provider)
  return () => {
    if (backendCommandProviders.get(surface) === provider) backendCommandProviders.delete(surface)
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
 *
 * `surface` is the sending composer's (commandSurfaceOf): only that
 * conversation's commands count, and only its runner runs one.
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

export const slashCommandSuggestion = {
  items: ({ query, commands, editor }: { query: string; commands: SlashCommandItem[]; editor?: Parameters<typeof commandSurfaceOf>[0] }): SlashCommandItem[] => {
    const q = query.toLowerCase().slice(1) // Remove leading /

    // Merge backend (app/core) commands when the composer's conversation has a
    // provider (its command runner). Docs register none, so their menu is unchanged.
    let backendItems: SlashCommandItem[] = []
    const provider = providerFor(commandSurfaceOf(editor))
    if (provider) {
      try {
        backendItems = provider(q).map(toBackendItem)
      } catch {
        backendItems = []
      }
    }

    if (!q) {
      // Show backend commands first, then a trimmed set of formatting commands.
      return [...backendItems, ...commands].slice(0, 16)
    }
    const filteredLocal = commands.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.id.toLowerCase().includes(q)
    )
    return [...backendItems, ...filteredLocal].slice(0, 16)
  },

  render: () => {
    let component: ReactRenderer<SlashRef> | undefined
    let popup: TippyInstance | undefined

    return {
      onStart: (props: SuggestionProps) => {
        slashMenuOpen = true
        component = new ReactRenderer(SlashCommandList, {
          props,
          editor: props.editor,
        })

        popup = tippy("body", {
          getReferenceClientRect: () =>
            props.clientRect?.() ?? DOM_RECT_FALLBACK,
          appendTo: () => document.body,
          content: component.element,
          showOnCreate: true,
          interactive: true,
          trigger: "manual",
          placement: "bottom-start",
          offset: [0, 6],
          // The list is the floating surface; tippy's own box draws nothing.
          theme: "none",
          arrow: false,
          popperOptions: { modifiers: [{ name: "flip", options: { fallbackPlacements: ["top-start"] } }] },
        })[0]
      },

      onUpdate(props: SuggestionProps) {
        component?.updateProps(props)
        popup?.setProps({
          getReferenceClientRect: () =>
            props.clientRect?.() || DOM_RECT_FALLBACK,
        })
      },

      onKeyDown(props: SuggestionKeyDownProps) {
        if (props.event.key === "Escape") {
          // Only while the menu shows: a second Escape reaches the page.
          if (!popup?.state.isVisible) return false
          slashMenuOpen = false
          popup.hide()
          return true
        }
        if (!component?.ref) return false
        return component.ref.onKeyDown(props)
      },

      onExit() {
        slashMenuOpen = false
        popup?.destroy()
        component?.destroy()
        popup = undefined
        component = undefined
      },
    }
  },
}

type SlashRef = {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean
}

interface SlashProps extends SuggestionProps {
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
const RECENT_KEY = "onecamp-slash-recent"
function readRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]").slice(0, 3)
  } catch {
    return []
  }
}
function pushRecent(id: string) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([id, ...readRecent().filter((r) => r !== id)].slice(0, 3)))
  } catch {
    /* private window */
  }
}

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
  // A doc's menu is the one configured with AI commands; ask the extension,
  // since the matched items are empty exactly when this matters.
  const inDoc = !!props.editor?.extensionManager?.extensions
    ?.find((e: { name: string }) => e.name === "slash-command")
    ?.options?.commands?.some((c: SlashCommandItem) => c.section === "AI")

  const ordered = React.useMemo(() => {
    const recentIds = query ? [] : readRecent()
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
    if (entry.item.section !== "Commands") pushRecent(entry.item.id)
    entry.item.command({ editor: props.editor, range: props.range })
  }

  const askAI = () => {
    props.editor.chain().focus().deleteRange(props.range).run()
    window.dispatchEvent(new CustomEvent("doc-ai-slash", { detail: { action: "write", prompt: query } }))
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
      label="Insert a block"
      header={query ? `/ ${query}` : "Blocks"}
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
          <span className="text-ink-3">No block called “{query}”</span>
        )
      }
    />
    </div>
  )
})

SlashCommandList.displayName = "SlashCommandList"
