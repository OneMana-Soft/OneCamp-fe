"use client"

import * as React from "react"
import Link from "next/link"
import type { Editor } from "@tiptap/react"

import {
  Bookmark,
  BookmarkCheck,
  Check,
  ChevronRight,
  Download,
  Ellipsis,
  Eye,
  Globe,
  History,
  Keyboard,
  Link2,
  Lock,
  Maximize2,
  MessageCircle,
  Minimize,
} from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/CommandList"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ActiveUsersBar, type ActiveUser } from "@/components/docEditor/ActiveUsersBar"
import { SaveDot, type SaveState } from "@/components/docEditor/SaveDot"
import { readingLine, useDocCounts } from "@/components/docEditor/docCounts"
import { useLaterActions, useSavedEntry } from "@/hooks/useLater"
import { usePost } from "@/hooks/usePost"
import { PostEndpointUrl } from "@/services/endPoints"
import { cn } from "@/lib/utils/helpers/cn"
import type { DocInfoInterface } from "@/types/doc"

/**
 * The doc's header (content.md D05): 52 px, quiet. On the left the
 * breadcrumb ("Docs › title") with the save dot after the title; on the
 * right the presence stack, comments, More, a hairline divider and Share as
 * the one secondary button, its icon saying who can see the doc. Everything
 * occasional (save for later, focus, full width, export, shortcuts, viewed
 * by, version history, the word count) is in More. The bottom hairline
 * appears only once the body has scrolled.
 */
export interface DocHeaderProps {
  doc: DocInfoInterface
  title: string
  canEdit: boolean
  canShare: boolean
  scrolled: boolean
  saveState: SaveState
  savedAt?: Date | null
  live: boolean
  onRetrySave?: () => void
  users: ActiveUser[]
  commentCount: number
  onComments: () => void
  onRename: (title: string) => void
  onShare: () => void
  focusMode: boolean
  onFocusMode: () => void
  fullWidth: boolean
  onFullWidth: () => void
  onExport: () => void
  onShortcuts: () => void
  onViewers: () => void
  onHistory: () => void
  editor: Editor | null
}

export function DocHeader(props: DocHeaderProps) {
  const { doc, title, canEdit, canShare, scrolled, saveState, savedAt, live, onRetrySave, users, commentCount, onComments, onShare } = props
  return (
    <header
      data-doc-header=""
      data-scrolled={scrolled}
      className={cn(
        "relative z-10 flex h-[52px] shrink-0 items-center gap-2 bg-sheet pl-5 pr-3",
        "after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-line after:opacity-0 after:transition-opacity after:duration-[140ms]",
        scrolled && "after:opacity-100",
      )}
    >
      <DocBreadcrumb title={title} canEdit={canEdit} onRename={props.onRename} />
      <SaveDot state={saveState} savedAt={savedAt} live={live} onRetry={onRetrySave} />
      {!canEdit && (
        <span className="tag ml-1 bg-hover text-ink-2" data-read-only="">
          Read only
        </span>
      )}
      <div className="flex-1" />
      <ActiveUsersBar users={users} maxShown={4} />
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onComments}
            aria-label={`Comments, ${commentCount || 0}`}
            className="inline-flex h-7 items-center gap-1 rounded-lg px-1.5 text-ink-3 outline-none transition-colors hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-brand"
          >
            <MessageCircle className="size-4" aria-hidden="true" />
            {commentCount > 0 && <span className="text-meta tabular-nums text-ink-2">{commentCount}</span>}
          </button>
        </TooltipTrigger>
        <TooltipContent>Comments</TooltipContent>
      </Tooltip>
      <DocMoreMenu {...props} />
      {canShare && (
        <>
          <span aria-hidden="true" className="mx-2 h-4 w-px bg-line-2" />
          <Button variant="secondary" size="sm" onClick={onShare} data-doc-share="" className="gap-1.5">
            {doc.doc_private ? <Lock className="!size-3.5" aria-hidden="true" /> : <Globe className="!size-3.5" aria-hidden="true" />}
            Share
          </Button>
        </>
      )}
    </header>
  )
}

/** "Docs › title". The title renames in place: Enter or blur saves, Escape reverts. */
function DocBreadcrumb({ title, canEdit, onRename }: { title: string; canEdit: boolean; onRename: (t: string) => void }) {
  const [editing, setEditing] = React.useState(false)
  const [draft, setDraft] = React.useState(title)
  const inputRef = React.useRef<HTMLInputElement>(null)
  React.useEffect(() => {
    if (!editing) setDraft(title)
  }, [title, editing])
  React.useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])
  const save = () => {
    setEditing(false)
    const next = draft.trim() || "Untitled"
    if (next !== title) onRename(next)
  }
  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1 text-ui">
      <Link href="/app/doc" className="rounded-md px-1 text-ink-2 outline-none transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-brand">
        Docs
      </Link>
      <ChevronRight aria-hidden="true" className="size-3.5 shrink-0 text-ink-4" />
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          aria-label="Doc title"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              save()
            } else if (e.key === "Escape") {
              // Handled here: the doc's comments panel stays open.
              e.preventDefault()
              e.stopPropagation()
              setDraft(title)
              setEditing(false)
            }
          }}
          className="field-surface h-7 w-[360px] max-w-full rounded-lg px-2 text-ui font-medium text-ink outline-none"
        />
      ) : (
        <button
          type="button"
          disabled={!canEdit}
          onClick={() => setEditing(true)}
          title={canEdit ? "Rename" : undefined}
          aria-current="page"
          className={cn(
            "max-w-[360px] truncate rounded-md px-1 py-0.5 text-left font-medium text-ink outline-none disabled:cursor-default disabled:opacity-100",
            canEdit && "cursor-text hover:bg-hover focus-visible:ring-2 focus-visible:ring-brand",
          )}
        >
          <span key={title} className="content-rise inline-block align-bottom">
            {title || "Untitled"}
          </span>
        </button>
      )}
    </nav>
  )
}

/** "412 words · 2 min read", counted only while the menu is open. */
function WordCountRow({ editor }: { editor: Editor }) {
  const counts = useDocCounts(editor)
  return <span className="tabular-nums">{readingLine(counts).replace(", ", " · ")}</span>
}

function DocMoreMenu({
  doc,
  title,
  canEdit,
  focusMode,
  onFocusMode,
  fullWidth,
  onFullWidth,
  onExport,
  onShortcuts,
  onViewers,
  onHistory,
  editor,
}: DocHeaderProps) {
  const [open, setOpen] = React.useState(false)
  const saved = useSavedEntry("doc", doc.doc_uuid)
  const { save, remove } = useLaterActions()
  const copyLink = () => {
    const url = `${window.location.origin}/app/doc/${doc.doc_uuid}`
    void navigator.clipboard?.writeText(url).catch(() => {})
  }
  const item = "h-[30px] gap-2.5 rounded-lg text-ui-sm [&_svg]:size-4 [&_svg]:text-ink-3"
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="More doc actions"
              className="inline-flex size-7 items-center justify-center rounded-lg text-ink-3 outline-none transition-colors hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-brand data-[state=open]:bg-press data-[state=open]:text-ink"
            >
              <Ellipsis className="size-4" />
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>More</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" sideOffset={6} className="content-float w-60 rounded-xl p-1 shadow-e3" data-doc-more-menu="">
        <DropdownMenuItem
          className={item}
          onSelect={() =>
            saved
              ? void remove(saved.id).catch(() => {})
              : void save({ item_type: "doc", item_id: doc.doc_uuid, link: `/app/doc/${doc.doc_uuid}`, title: title || "Untitled doc", remind_at: null }).catch(() => {})
          }
        >
          {saved ? <BookmarkCheck /> : <Bookmark />}
          <span className="flex-1">{saved ? "Saved for later" : "Save for later"}</span>
          <Kbd>L</Kbd>
        </DropdownMenuItem>
        <DropdownMenuItem className={item} onSelect={onFocusMode}>
          <Minimize />
          <span className="flex-1">{focusMode ? "Leave focus mode" : "Focus mode"}</span>
          <Kbd>⇧F</Kbd>
        </DropdownMenuItem>
        <DropdownMenuItem className={cn(item, "hidden md:flex")} onSelect={onFullWidth} role="menuitemcheckbox" aria-checked={fullWidth}>
          <Maximize2 />
          <span className="flex-1">Full width</span>
          {fullWidth && <Check className="!text-ink" />}
        </DropdownMenuItem>
        <DropdownMenuSeparator className="mx-1 bg-line" />
        {canEdit && (
          <>
            <DropdownMenuItem className={item} onSelect={onHistory}>
              <History />
              <span className="flex-1">Version history</span>
            </DropdownMenuItem>
            <DropdownMenuItem className={item} onSelect={onViewers}>
              <Eye />
              <span className="flex-1">Viewed by</span>
            </DropdownMenuItem>
          </>
        )}
        {editor && (
          <div className="flex h-[30px] items-center gap-2.5 px-2 text-ui-sm text-ink-3" data-doc-word-count="">
            <span aria-hidden="true" className="size-4" />
            {open && <WordCountRow editor={editor} />}
          </div>
        )}
        <DropdownMenuSeparator className="mx-1 bg-line" />
        <DropdownMenuItem className={item} onSelect={onExport}>
          <Download />
          <span className="flex-1">Export as Markdown</span>
        </DropdownMenuItem>
        <DropdownMenuItem className={item} onSelect={copyLink}>
          <Link2 />
          <span className="flex-1">Copy link</span>
          <Kbd>⌘L</Kbd>
        </DropdownMenuItem>
        <DropdownMenuSeparator className="mx-1 bg-line" />
        <DropdownMenuItem className={item} onSelect={onShortcuts}>
          <Keyboard />
          <span className="flex-1">Keyboard shortcuts</span>
          <Kbd>?</Kbd>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** The doc's shortcuts (D29): a 560 px dialog in two columns, grouped. */
const SHORTCUT_GROUPS: Array<{ title: string; rows: Array<{ label: string; keys: string[] }> }> = [
  {
    title: "Text",
    rows: [
      { label: "Bold", keys: ["⌘", "B"] },
      { label: "Italic", keys: ["⌘", "I"] },
      { label: "Underline", keys: ["⌘", "U"] },
      { label: "Strikethrough", keys: ["⌘", "⇧", "X"] },
      { label: "Inline code", keys: ["⌘", "E"] },
      { label: "Link", keys: ["⌘", "K"] },
    ],
  },
  {
    title: "Blocks",
    rows: [
      { label: "Insert a block", keys: ["/"] },
      { label: "Heading 1, 2, 3", keys: ["#", "##", "###"] },
      { label: "Bulleted list", keys: ["-"] },
      { label: "To-do list", keys: ["[]"] },
      { label: "Quote", keys: [">"] },
      { label: "Code block", keys: ["```"] },
    ],
  },
  {
    title: "Doc",
    rows: [
      { label: "Formatting bar", keys: ["⌥", "F10"] },
      { label: "Undo", keys: ["⌘", "Z"] },
      { label: "Redo", keys: ["⌘", "⇧", "Z"] },
      { label: "Line break", keys: ["⇧", "⏎"] },
      { label: "Mention someone", keys: ["@"] },
      { label: "These shortcuts", keys: ["?"] },
    ],
  },
]

export function DocShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription className="sr-only">The doc editor&apos;s shortcuts. Press Escape to close.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2" data-doc-shortcuts="">
          {SHORTCUT_GROUPS.map((g) => (
            <section key={g.title} className={g.title === "Doc" ? "sm:col-span-2 sm:grid sm:grid-cols-2 sm:gap-x-8" : undefined}>
              <h3 className="mb-1 text-meta font-medium text-ink-2 sm:col-span-2">{g.title}</h3>
              {g.rows.map((r) => (
                <div key={r.label} className="flex h-8 items-center justify-between gap-3">
                  <span className="text-ui-sm text-ink-2">{r.label}</span>
                  <span className="flex gap-1">
                    {r.keys.map((k) => (
                      <Kbd key={k}>{k}</Kbd>
                    ))}
                  </span>
                </div>
              ))}
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** Renames the doc (PostEndpointUrl.UpdateDoc); for the breadcrumb. */
export function useDocRename(docId: string) {
  const { makeRequest } = usePost()
  return React.useCallback(
    (title: string) =>
      makeRequest({ apiEndpoint: PostEndpointUrl.UpdateDoc, payload: { doc_uuid: docId, doc_title: title } }),
    [docId, makeRequest],
  )
}
