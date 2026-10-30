"use client"

import * as React from "react"
import type { Editor } from "@tiptap/react"

import { Check, Ellipsis, Globe, Lock, MessageCircle } from "@/lib/icons"
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
import { SaveDot } from "@/components/docEditor/SaveDot"
import { useDocSaveDot, type DocSaveSource } from "@/components/docEditor/docSaveState"
import { readingLine, useDocCounts } from "@/components/docEditor/docCounts"
import { keyLabel } from "@/components/docEditor/shortcuts"
import { useModKey } from "@/hooks/useModKey"
import { cn } from "@/lib/utils/helpers/cn"
import type { DocInfoInterface } from "@/types/doc"
import { MORE_GROUPS } from "./actions/doc"
import { actionGroupsFor } from "./registry/readers"
import { chordGlyphs, shortcutDialogGroups, shortcutRowsFor } from "./registry/shortcuts"
import { SlotOutlet } from "./registry/slots"
import { LazyConnected } from "@/components/workGraph/LazyConnected"
import type { EditionGate } from "./registry/registry"
import type { ActionContext } from "./registry/types"

/**
 * The doc's header (content.md D05): 52 px, quiet. On the left the
 * breadcrumb (B6's, the whole path, in the crumbs slot) with the save dot
 * after it; on the
 * right the presence stack, comments, More, a hairline divider and Share as
 * the one secondary button, its icon saying who can see the doc. Everything
 * occasional is in More: the actions registered for it (actions/doc.ts: save
 * for later, focus, full width, version history, viewed by, export, copy
 * link, shortcuts; and what packages add), in their groups, with the word
 * count. Packages' pieces go in its slots (crumbs, titleChips, modes,
 * rightCluster, more). The bottom hairline appears only once the body has
 * scrolled.
 */
export interface DocHeaderProps {
  doc: DocInfoInterface
  canEdit: boolean
  canShare: boolean
  scrolled: boolean
  /** What the save dot follows: the dot reads the saves itself (DocSaveDot). */
  save: DocSaveSource
  users: ActiveUser[]
  commentCount: number
  onComments: () => void
  onShare: () => void
  /** The context the doc's actions run in, read as More opens (the page's state, its bus). */
  actions: () => ActionContext
  gate: EditionGate
  editor: Editor | null
}

/**
 * The save dot, reading the doc's saves itself. They change as often as a key
 * is typed, so only the dot renders again for them: when the page read them,
 * the page, this header and everything in it rendered two to four times a key
 * (about 340 components a key in a 12-block doc, I20).
 */
function DocSaveDot({ source }: { source: DocSaveSource }) {
  const { state, savedAt } = useDocSaveDot(source)
  return <SaveDot state={state} savedAt={savedAt} live={source.live} />
}

export function DocHeader(props: DocHeaderProps) {
  const { doc, canEdit, canShare, scrolled, save, users, commentCount, onComments, onShare } = props
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
      <SlotOutlet slot="crumbs" gate={props.gate} docId={doc.doc_uuid} editor={props.editor} />
      <DocSaveDot source={save} />
      {!canEdit && (
        <span className="tag ml-1 bg-hover text-ink-2" data-read-only="">
          Read only
        </span>
      )}
      <SlotOutlet slot="titleChips" gate={props.gate} docId={doc.doc_uuid} editor={props.editor} />
      <div className="flex-1" />
      <SlotOutlet slot="modes" gate={props.gate} docId={doc.doc_uuid} editor={props.editor} />
      <SlotOutlet slot="rightCluster" gate={props.gate} docId={doc.doc_uuid} editor={props.editor} />
      <ActiveUsersBar users={users} maxShown={4} />
      <LazyConnected kind="doc" id={doc.doc_uuid} title={doc.doc_title} tip="Connected" className="size-7 rounded-lg" />
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

/** "412 words · 2 min read", counted only while the menu is open. */
function WordCountRow({ editor }: { editor: Editor }) {
  const counts = useDocCounts(editor)
  return <span className="tabular-nums">{readingLine(counts).replace(", ", " · ")}</span>
}

/** An action's key as this computer's keyboard says it: "⌘L" on a Mac, "Ctrl L" elsewhere. */
function shortcutLabel(chord: string, mac: boolean): string {
  return chordGlyphs(chord).map((k) => keyLabel(k, mac)).join(mac ? "" : " ")
}

function DocMoreMenu({ doc, editor, actions, gate }: DocHeaderProps) {
  const [open, setOpen] = React.useState(false)
  const mac = useModKey() === "⌘"
  const item = "h-[30px] gap-2.5 rounded-lg text-ui-sm [&_svg]:size-4 [&_svg]:text-ink-3"
  // Read as it opens: what is on (focus mode, saved), what this person may do.
  const groups = open ? actionGroupsFor("more", actions(), MORE_GROUPS) : []
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
        {groups.map((g, i) => (
          <React.Fragment key={g.group}>
            {i > 0 && <DropdownMenuSeparator className="mx-1 bg-line" />}
            {g.actions.map((a) => {
              const Icon = a.icon
              return (
                <DropdownMenuItem
                  key={a.action.id}
                  className={item}
                  onSelect={() => void a.run()}
                  data-action={a.action.id}
                  {...(a.checked !== undefined && a.action.isChecked && !a.action.shortcut ? { role: "menuitemcheckbox", "aria-checked": a.checked } : {})}
                >
                  {Icon ? <Icon /> : <span aria-hidden="true" className="size-4" />}
                  <span className="flex-1">{a.label}</span>
                  {a.checked && !a.action.shortcut && <Check className="!text-ink" />}
                  {a.action.shortcut && <Kbd>{shortcutLabel(a.action.shortcut, mac)}</Kbd>}
                </DropdownMenuItem>
              )
            })}
            {/* The word count, with the doc's own items, counted only while the menu is open. */}
            {g.group === "doc" && editor && (
              <div className="flex h-[30px] items-center gap-2.5 px-2 text-ui-sm text-ink-3" data-doc-word-count="">
                <span aria-hidden="true" className="size-4" />
                <WordCountRow editor={editor} />
              </div>
            )}
          </React.Fragment>
        ))}
        {open && <SlotOutlet slot="more" gate={gate} docId={doc.doc_uuid} editor={editor} />}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * The doc's shortcuts (D29): a 560 px dialog in two columns, grouped, from
 * the one table the registry makes (registry/shortcuts.ts: the blocks' keys
 * and the actions'), which shortcuts.test.tsx fires row by row. Keys read as
 * this computer's keyboard does (⌘ on a Mac, Ctrl elsewhere).
 */
export function DocShortcutsDialog({ open, onClose, gate = { ai: false } }: { open: boolean; onClose: () => void; gate?: EditionGate }) {
  const mac = useModKey() === "⌘"
  const SHORTCUT_GROUPS = React.useMemo(() => shortcutDialogGroups(shortcutRowsFor("doc", gate)), [gate])
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription className="sr-only">The doc editor&apos;s shortcuts. Press Escape to close.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2" data-doc-shortcuts="">
          {SHORTCUT_GROUPS.map((g) => (
            <section key={g.title} className={g.title === "Doc" ? "sm:col-span-2 sm:grid sm:grid-cols-2 sm:gap-x-8" : undefined}>
              <h3 className="mb-1 text-meta font-medium text-ink-2 sm:col-span-2">{g.title}</h3>
              {g.rows.map((r) => (
                <div key={r.label} className="flex min-h-8 items-center justify-between gap-3" data-shortcut-row={r.label}>
                  <span className="text-ui-sm text-ink-2">{r.label}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    {r.ways.map((way, i) => (
                      <React.Fragment key={way.join("+")}>
                        {i > 0 && <span className="px-0.5 text-meta text-ink-3">{r.sequence ? "then" : "or"}</span>}
                        {way.map((k) => (
                          <Kbd key={k}>{keyLabel(k, mac)}</Kbd>
                        ))}
                      </React.Fragment>
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
