import { ReactRenderer } from "@tiptap/react"
import { SuggestionKeyDownProps, SuggestionProps } from "@tiptap/suggestion"
import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react"
import tippy, { Instance as TippyInstance } from "tippy.js"
import { Heading1, Heading2, Heading3, List, ListOrdered, Quote, Code, Minus, CheckSquare, Image, Sparkles, MessageSquare, ChevronRight, Bold, Italic, Strikethrough, Zap } from "@/lib/icons";
import { Lightbulb, Command, Underline as UnderlineIcon, Eraser } from "@/lib/icons";

export interface SlashCommandItem {
  id: string
  title: string
  description: string
  icon: React.ElementType
  section: string
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
    title: "Inline Code",
    description: "Format text as inline code",
    icon: Code,
    section: "Format",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleCode().run()
    },
  },
  {
    id: "clearFormatting",
    title: "Clear Formatting",
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
    title: "Heading 1",
    description: "Large section heading",
    icon: Heading1,
    section: "Basic blocks",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode("heading", { level: 1 }).run()
    },
  },
  {
    id: "heading2",
    title: "Heading 2",
    description: "Medium section heading",
    icon: Heading2,
    section: "Basic blocks",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode("heading", { level: 2 }).run()
    },
  },
  {
    id: "heading3",
    title: "Heading 3",
    description: "Small section heading",
    icon: Heading3,
    section: "Basic blocks",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode("heading", { level: 3 }).run()
    },
  },
  {
    id: "bulletList",
    title: "Bullet List",
    description: "Create a simple bullet list",
    icon: List,
    section: "Basic blocks",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBulletList().run()
    },
  },
  {
    id: "orderedList",
    title: "Numbered List",
    description: "Create a numbered list",
    icon: ListOrdered,
    section: "Basic blocks",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleOrderedList().run()
    },
  },
  {
    id: "taskList",
    title: "Task List",
    description: "Create a task list with checkboxes",
    icon: CheckSquare,
    section: "Basic blocks",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleTaskList().run()
    },
  },
  {
    id: "blockquote",
    title: "Quote",
    description: "Insert a blockquote",
    icon: Quote,
    section: "Basic blocks",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBlockquote().run()
    },
  },
  {
    id: "codeBlock",
    title: "Code Block",
    description: "Insert a code block",
    icon: Code,
    section: "Basic blocks",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setCodeBlock().run()
    },
  },
  {
    id: "horizontalRule",
    title: "Divider",
    description: "Insert a horizontal divider",
    icon: Minus,
    section: "Basic blocks",
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
    description: "Colored info box with emoji",
    icon: MessageSquare,
    section: "Advanced blocks",
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
    section: "Advanced blocks",
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
    section: "Advanced blocks",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleImage().run()
    },
  },
]

// ─── AI assistants — dispatch events captured by docInput.tsx ───
const AI_COMMANDS: SlashCommandItem[] = [
  {
    id: "ai-write",
    title: "AI: Write",
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
    title: "AI: Summarize",
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
export const COMMANDS: SlashCommandItem[] = DOC_SLASH_COMMANDS
export const BASE_COMMANDS: SlashCommandItem[] = CHAT_COMMANDS
export const DOC_COMMANDS: SlashCommandItem[] = DOC_BLOCK_COMMANDS

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

let backendCommandProvider: BackendCommandProvider | null = null

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

/** Register/replace the backend command provider (called by the chat composer). */
export function setBackendCommandProvider(provider: BackendCommandProvider | null) {
  backendCommandProvider = provider
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
          detail: { command: entry.command, typed: entry.command },
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
export function resolveBackendCommandName(query: string): string | null {
  if (!backendCommandProvider) return null
  const name = (query || "").trim().toLowerCase()
  if (!name) return null
  try {
    const entries = backendCommandProvider(name)
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
): boolean {
  const text = (plainText || "").trim()
  if (!text.startsWith("/")) return false
  const afterSlash = text.slice(1)
  const name = afterSlash.split(/\s+/)[0] || ""
  const resolved = resolveBackendCommandName(name)
  if (!resolved) return false
  // `typed` carries the command name + args (no leading slash); the runner
  // strips the command token to get the argument text.
  window.dispatchEvent(
    new CustomEvent("chat-slash-command", {
      detail: { command: resolved, typed: afterSlash, mentions: mentions || {} },
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
  items: ({ query, commands }: { query: string; commands: SlashCommandItem[] }): SlashCommandItem[] => {
    const q = query.toLowerCase().slice(1) // Remove leading /

    // Merge backend (app/core) commands when a provider is registered (chat
    // composer). Docs register no provider, so their menu is unchanged.
    let backendItems: SlashCommandItem[] = []
    if (backendCommandProvider) {
      try {
        backendItems = backendCommandProvider(q).map(toBackendItem)
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
          slashMenuOpen = false
          popup?.hide()
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

const SECTION_ORDER = ["Commands", "Basic blocks", "Advanced blocks", "Format", "AI"]

const SlashCommandList = forwardRef<SlashRef, SlashProps>((props, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const itemRefs = useRef<Map<number, HTMLButtonElement>>(new Map())

  const groupedItems = React.useMemo(() => {
    const groups = new Map<string, { item: SlashCommandItem; globalIndex: number }[]>()
    props.items.forEach((item, index) => {
      const list = groups.get(item.section) || []
      list.push({ item, globalIndex: index })
      groups.set(item.section, list)
    })
    return SECTION_ORDER.filter((s) => groups.has(s)).map((section) => ({
      section,
      items: groups.get(section)!,
    }))
  }, [props.items])

  const flatItems = React.useMemo(
    () => groupedItems.flatMap((g) => g.items),
    [groupedItems]
  )

  const selectItem = (globalIndex: number) => {
    const entry = flatItems[globalIndex]
    if (entry) {
      entry.item.command({ editor: props.editor, range: props.range })
    }
  }

  const upHandler = () => {
    setSelectedIndex((i) => (i + flatItems.length - 1) % flatItems.length)
  }

  const downHandler = () => {
    setSelectedIndex((i) => (i + 1) % flatItems.length)
  }

  const enterHandler = () => {
    selectItem(selectedIndex)
  }

  useEffect(() => {
    setSelectedIndex(0)
  }, [props.items])

  // Scroll selected item into view when navigating with keyboard
  useEffect(() => {
    const el = itemRefs.current.get(selectedIndex)
    if (el) {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [selectedIndex])

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: SuggestionKeyDownProps) => {
      if (event.key === "ArrowUp") {
        upHandler()
        return true
      }
      if (event.key === "ArrowDown") {
        downHandler()
        return true
      }
      if (event.key === "Enter") {
        enterHandler()
        return true
      }
      return false
    },
  }))

  if (props.items.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-md border bg-popover text-popover-foreground shadow-md px-3 py-2 text-sm text-muted-foreground">
        <Command className="h-4 w-4" />
        No commands found
      </div>
    )
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-xl min-w-[17rem] max-h-[22rem] overflow-y-auto py-1.5 px-1">
      {groupedItems.map((group) => (
        <div key={group.section} className="mb-1 last:mb-0">
          <div className="px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            {group.section}
          </div>
          <div className="flex flex-col gap-px">
            {group.items.map(({ item, globalIndex }) => {
              const Icon = item.icon
              const isSelected = globalIndex === selectedIndex
              return (
                <button
                  key={item.id}
                  ref={(el) => {
                    if (el) itemRefs.current.set(globalIndex, el)
                    else itemRefs.current.delete(globalIndex)
                  }}
                  className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                    isSelected
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-accent/50"
                  }`}
                  onClick={() => selectItem(globalIndex)}
                  onMouseEnter={() => setSelectedIndex(globalIndex)}
                >
                  <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border ${
                    isSelected ? "border-accent-foreground/20 bg-accent-foreground/10" : "bg-muted"
                  }`}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="font-medium truncate">{item.title}</span>
                    <span className="text-[11px] text-muted-foreground truncate">{item.description}</span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
})

SlashCommandList.displayName = "SlashCommandList"
export default SlashCommandList
