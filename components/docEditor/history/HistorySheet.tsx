"use client"

/**
 * Version history (docs programme B8, collaboration.md P1-B; registered as the
 * dialog "doc.history" in ./register.ts, loaded when first opened): every
 * version kept, in days, beside a read-only preview in the doc's own type.
 * "Show changes" marks what changed against the version before or the doc
 * now: words added in moss, words removed struck in berry. A version can be
 * named and pinned, and restored, live, for everyone (A4's Snapshot Service).
 * On a phone, held either way (components/ui/overlayMode), it is a sheet: the
 * list, then a version, Show changes and Restore pinned in its footer.
 */

import "./history.css"
import * as React from "react"
import { ChevronLeft, History, Loader2, Plus, RotateCcw, X } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { useFetch } from "@/hooks/useFetch"
import { useSheetMode } from "@/components/ui/overlayMode"
import { toast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { OverlayBody } from "@/components/ui/overlay"
import { ConfirmAlertDialog } from "@/components/dialog/confirmAlertDialog"
import { editorOf, useDocBus } from "@/components/docEditor/registry/commandBus"
import { GetEndpointUrl } from "@/services/endPoints"
import type { DocInfoResponse } from "@/types/doc"
import { earlierVersions, nameVersion, restoreVersion, saveVersion } from "./actions"
import { VersionRail } from "./VersionRail"
import { VersionPreview, type Drawn } from "./VersionPreview"
import { DiffBar, VersionBar, type CompareWith } from "./VersionBar"
import { MAX_NAME, mergeVersionLists, versionBodyKey, versionsKey, versionTitle, versionWhen, type DocVersion, type VersionList } from "./versions"

const QUIET = { suppressErrorToast: true }
/** A version's body never changes: read once. */
/** How long replay shows each version. */
const REPLAY_STEP_MS = 1600
const BODY_ONCE = { revalidateOnFocus: false, revalidateOnReconnect: false, revalidateIfStale: false, shouldRetryOnError: false }
const CHANGES_PREF = "oc.history.showChanges"

function useVersionBody(docId: string, versionId: string | null | undefined) {
  const { data, isError, mutate } = useFetch<{ data?: { html?: string } }>(versionId ? versionBodyKey(docId, versionId) : "", undefined, BODY_ONCE, QUIET)
  return { html: data?.data?.html, failed: isError, retry: () => void mutate() }
}

/** Show changes stays as the person left it, from one opening to the next. */
function useShowChanges(): [boolean, (on: boolean) => void] {
  const [on, setOn] = React.useState(() => {
    try {
      return localStorage.getItem(CHANGES_PREF) === "1"
    } catch {
      return false
    }
  })
  const set = React.useCallback((next: boolean) => {
    setOn(next)
    try {
      localStorage.setItem(CHANGES_PREF, next ? "1" : "0")
    } catch {
      // private mode: it lasts this opening
    }
  }, [])
  return [on, set]
}

export default function HistorySheet({ docId, onClose }: { docId: string; onClose(): void }) {
  const sheet = useSheetMode()
  const bus = useDocBus()
  const [open, setOpen] = React.useState(true)
  const close = React.useCallback(() => {
    setOpen(false)
    // The sheet's own exit (the dialog's 150 ms, the phone sheet's 300 ms), then the outlet lets it go.
    window.setTimeout(onClose, sheet ? 320 : 160)
  }, [onClose, sheet])

  const list = useFetch<{ data?: VersionList }>(versionsKey(docId), undefined, { revalidateOnFocus: false }, QUIET)
  // A long history a page at a time: the first page is the list above, the
  // pages before it are loaded as asked and kept here.
  const [earlier, setEarlier] = React.useState<VersionList[]>([])
  const [more, setMore] = React.useState<{ loading: boolean; failed: string | null }>({ loading: false, failed: null })
  const data = React.useMemo(() => mergeVersionLists([list.data?.data, ...earlier]), [list.data, earlier])
  const versions = React.useMemo(() => data?.versions ?? [], [data])
  const loadEarlier = React.useCallback(async () => {
    const cursor = data?.next
    if (!cursor) return
    setMore({ loading: true, failed: null })
    try {
      const page = await earlierVersions(docId, cursor)
      setEarlier((pages) => [...pages, page])
      setMore({ loading: false, failed: null })
    } catch (e) {
      setMore({ loading: false, failed: (e as Error).message })
    }
  }, [data?.next, docId])
  const people = data?.people ?? null
  const doc = useFetch<DocInfoResponse>(`${GetEndpointUrl.GetDocInfo}/${docId}`, undefined, undefined, QUIET)
  const docTitle = doc.data?.data?.doc_title?.trim() || "Untitled"

  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  // The newest version is chosen once the list is here; a list read again
  // (after a name or a pin) never moves the choice to a version kept since.
  React.useEffect(() => {
    if (!selectedId && versions[0]) setSelectedId(versions[0].id)
  }, [selectedId, versions])
  const index = Math.max(0, versions.findIndex((v) => v.id === selectedId))
  const selected: DocVersion | null = versions[index] ?? null
  const before: DocVersion | null = versions[index + 1] ?? null
  const [phoneView, setPhoneView] = React.useState<"list" | "version">("list")

  const [showChanges, setShowChanges] = useShowChanges()
  const [compareWith, setCompareWith] = React.useState<CompareWith>("before")
  const [drawn, setDrawn] = React.useState<Drawn | null>(null)
  const [busy, setBusy] = React.useState(false)
  const scrollerRef = React.useRef<HTMLDivElement>(null)

  const body = useVersionBody(docId, selected?.id)
  const beforeBody = useVersionBody(docId, showChanges && compareWith === "before" ? before?.id : null)

  // The doc as it is now: the live copy this page holds (with what is being
  // typed), read when the comparison is asked for, not on every keystroke.
  const editor = editorOf(bus)
  const [nowHtml, setNowHtml] = React.useState<string | undefined>(undefined)
  React.useEffect(() => {
    if (!showChanges || compareWith !== "now") return
    const ed = editorOf(bus)
    setNowHtml(ed && !ed.isDestroyed ? ed.getHTML() : undefined)
  }, [showChanges, compareWith, selected?.id, bus])

  const compare = React.useMemo(() => {
    if (!showChanges) return null
    if (compareWith === "now") return editor ? { html: nowHtml } : null
    if (!before) return null
    return { key: before.id, html: beforeBody.html }
  }, [showChanges, compareWith, nowHtml, before, beforeBody.html, editor])

  React.useEffect(() => {
    if (!showChanges) setDrawn(null)
  }, [showChanges])

  const rename = React.useCallback(
    async (name: string, pinned: boolean) => {
      if (!selected) return
      await nameVersion(docId, selected.id, name, pinned)
      // A version on an earlier page is changed where it is kept.
      setEarlier((pages) =>
        pages.map((p) => ({ ...p, versions: (p.versions ?? []).map((v) => (v.id === selected.id ? { ...v, name: name.trim() || undefined, pinned } : v)) })),
      )
      await list.mutate()
    },
    [docId, selected, list],
  )

  // Replay: from the oldest version loaded to the newest, each with its
  // changes, one every 1.6 s; ← and → step by hand (older, newer).
  const [playing, setPlaying] = React.useState(false)
  const toggleReplay = React.useCallback(() => {
    if (playing) {
      setPlaying(false)
      return
    }
    if (versions.length < 2) return
    if (index === 0) setSelectedId(versions[versions.length - 1].id)
    setShowChanges(true)
    setCompareWith("before")
    setPlaying(true)
  }, [playing, versions, index, setShowChanges])
  React.useEffect(() => {
    if (!playing) return
    if (index <= 0) {
      setPlaying(false)
      return
    }
    const t = window.setTimeout(() => setSelectedId(versions[index - 1].id), REPLAY_STEP_MS)
    return () => window.clearTimeout(t)
  }, [playing, index, versions])
  const step = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.metaKey || e.ctrlKey) return
      const target = e.target as HTMLElement
      if (target.closest("input, textarea, [contenteditable='true'], [role='listbox']")) return
      const to = e.key === "ArrowLeft" ? index + 1 : e.key === "ArrowRight" ? index - 1 : -1
      if (to < 0 || to >= versions.length) return
      e.preventDefault()
      setPlaying(false)
      setSelectedId(versions[to].id)
    },
    [index, versions],
  )

  // Restoring asks first: what goes back, for whom, and that it can be undone.
  const [confirming, setConfirming] = React.useState(false)
  const restore = React.useCallback(async () => {
    if (!selected) return
    await restoreVersion(docId, selected.id)
    toast({ title: `Restored the version from ${whenInSentence(selected)}`, description: "Everyone with the doc open has it now. The doc as it was is kept as the newest version." })
    close()
  }, [docId, selected, close])

  const rail = (
    <VersionRail
      list={data}
      loading={list.isLoading}
      failed={list.isError}
      onRetry={() => void list.mutate()}
      selectedId={selected?.id ?? null}
      onSelect={(id) => {
        setPlaying(false)
        setSelectedId(id)
      }}
      more={data?.next ? { onMore: () => void loadEarlier(), loading: more.loading, failed: more.failed } : undefined}
      onOpen={
        sheet
          ? (id) => {
              setSelectedId(id)
              setPhoneView("version")
            }
          : undefined
      }
      autoFocus={!sheet}
    />
  )

  const preview = selected ? (
    <VersionPreview
      versionId={selected.id}
      html={body.html}
      failed={body.failed}
      onRetry={body.retry}
      compare={compare}
      onDrawn={setDrawn}
      onBusy={setBusy}
      scrollerRef={scrollerRef}
    />
  ) : (
    <div className="flex-1" />
  )

  const diffBar = showChanges && selected && (
    <DiffBar
      compareWith={compareWith}
      onCompareWith={setCompareWith}
      hasBefore={!!before}
      hasNow={!!editor}
      busy={busy}
      // The version shown couldn't be read: the preview says so, and there is nothing to compare.
      quiet={!!body.failed}
      baseFailed={compareWith === "before" && !!before && !!beforeBody.failed}
      onRetryBase={beforeBody.retry}
      stats={drawn?.stats ?? null}
      targets={drawn?.targets ?? []}
    />
  )

  const confirm = selected && (
    <ConfirmAlertDialog
      open={confirming}
      onOpenChange={setConfirming}
      title={selected.name?.trim() ? `Restore "${selected.name.trim()}"?` : `Restore the version from ${whenInSentence(selected)}?`}
      description="The doc goes back to this version for everyone, at once. What it says now is kept as a version first, so you can restore that if you change your mind."
      confirmText="Restore version"
      icon={RotateCcw}
      onConfirm={restore}
    />
  )

  const save = <SaveVersion docId={docId} onSaved={async (v) => {
    await list.mutate()
    setSelectedId(v.id)
    if (sheet) setPhoneView("version")
  }} compact={sheet} />

  if (sheet) {
    const reading = phoneView === "version" && !!selected
    return (
      <Drawer detent="large" open={open} onOpenChange={(o) => !o && close()}>
        <DrawerContent
          data-history-sheet=""
          // A version's Show changes and Restore: the sheet's pinned footer,
          // under a hairline from edge to edge, as the preview runs on above it.
          footer={
            reading ? (
              <div className="-mx-4 -mt-3 flex items-center gap-3 border-t border-line px-4 pt-2.5">
                <label className="flex flex-1 items-center gap-2 text-ui text-ink-2">
                  <Switch checked={showChanges} onCheckedChange={setShowChanges} />
                  Show changes
                </label>
                <Button className="gap-1.5" onClick={() => setConfirming(true)} data-restore-version="">
                  <RotateCcw className="!size-3.5" aria-hidden="true" />
                  Restore
                </Button>
              </div>
            ) : undefined
          }
        >
          <DrawerTitle className="sr-only">Version history</DrawerTitle>
          <DrawerDescription className="sr-only">Read, compare, name and restore earlier versions of {docTitle}.</DrawerDescription>
          {!reading ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex shrink-0 items-center gap-2 px-4 pb-2 pt-1">
                <h2 className="min-w-0 flex-1 truncate text-title-3 text-ink">Version history</h2>
                {save}
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">{rail}</div>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex shrink-0 items-center gap-1 px-2 pb-1">
                <Button variant="ghost" size="sm" className="gap-1 px-2" onClick={() => setPhoneView("list")}>
                  <ChevronLeft aria-hidden="true" />
                  Versions
                </Button>
              </div>
              <VersionBar version={selected} people={people} onName={rename} showChanges={showChanges} onShowChanges={setShowChanges} onRestore={() => setConfirming(true)} compact />
              {diffBar}
              {preview}
            </div>
          )}
          {confirm}
        </DrawerContent>
      </Drawer>
    )
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent
        hideClose
        // The rail focuses the version it shows (VersionRail autoFocus).
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="flex h-[calc(100dvh-3rem)] max-h-none w-[calc(100vw-3rem)] max-w-[1240px] flex-col gap-0 overflow-hidden p-0"
        data-history-sheet=""
        onKeyDown={step}
      >
        <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-line pl-5 pr-3">
          <span aria-hidden="true" className="flex size-7 items-center justify-center rounded-lg bg-hover text-ink-2">
            <History className="size-4" />
          </span>
          <DialogTitle className="text-heading text-ink">Version history</DialogTitle>
          <DialogDescription className="min-w-0 truncate text-ui text-ink-3">{docTitle}</DialogDescription>
          <div className="flex-1" />
          <Button variant="ghost" size="icon-sm" onClick={close} aria-label="Close version history" title="Close (Esc)">
            <X />
          </Button>
        </div>
        <div className="flex min-h-0 flex-1">
          <section aria-label={selected ? versionTitle(selected) : "Version"} className="flex min-w-0 flex-1 flex-col">
            {selected && (
              <VersionBar
                version={selected}
                people={people}
                onName={rename}
                showChanges={showChanges}
                onShowChanges={setShowChanges}
                onRestore={() => setConfirming(true)}
                replay={versions.length > 1 ? { playing, onToggle: toggleReplay } : undefined}
              />
            )}
            {diffBar}
            {preview}
          </section>
          <aside aria-label="Versions" className="flex w-[280px] shrink-0 flex-col border-l border-line lg:w-[320px]">
            <div className="flex h-12 shrink-0 items-center gap-2 px-4">
              <span className="flex-1 text-meta font-medium text-ink-3">Versions</span>
              {save}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">{rail}</div>
          </aside>
        </div>
        {confirm}
      </DialogContent>
    </Dialog>
  )
}

/** Mid-sentence: "the version from today, 2:32 PM". */
const whenInSentence = (v: DocVersion) => versionWhen(v).replace(/^(Today|Yesterday)/, (w) => w.toLowerCase())


/**
 * "Save version": the doc as it is now, kept, with a name if one is given.
 * A popover by the button on a computer; where history is a sheet (compact)
 * a sheet of its own over it, as a popover there floated over the sheet, its
 * Save pinned in the sheet's footer.
 */
function SaveVersion({ docId, onSaved, compact }: { docId: string; onSaved(v: DocVersion): Promise<void>; compact?: boolean }) {
  const [open, setOpen] = React.useState(false)
  const [name, setName] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      const v = await saveVersion(docId, name)
      setOpen(false)
      setName("")
      toast({ title: name.trim() ? `Saved "${name.trim()}"` : "Saved a version" })
      await onSaved(v)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const trigger = (
    <Button variant={compact ? "secondary" : "ghost"} size="sm" className="gap-1.5" data-save-version="">
      <Plus aria-hidden="true" />
      Save version
    </Button>
  )
  const formId = React.useId()
  const button = (
    <Button type="submit" form={formId} size={compact ? "lg" : "sm"} disabled={busy} aria-busy={busy || undefined} className={cn("gap-1.5", compact && "h-11 w-full")}>
      {busy && <Loader2 className="animate-spin" />}
      Save version
    </Button>
  )
  const form = (
    <form
      id={formId}
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
      className="space-y-2.5"
    >
      <label className="block text-ui font-medium text-ink" htmlFor="history-save-name">
        Keep the doc as it is now
      </label>
      <input
        id="history-save-name"
        value={name}
        maxLength={MAX_NAME}
        onChange={(e) => setName(e.target.value)}
        placeholder="Name it, if you like"
        autoFocus
        className="h-8 w-full rounded-md bg-sunken px-2.5 text-ui text-ink outline-none ring-1 ring-inset ring-line focus-visible:ring-2 focus-visible:ring-brand max-sm:h-11 max-sm:text-base"
      />
      <p className="text-meta text-ink-3">A named version is kept until you unname it.</p>
      {error && (
        <p role="alert" className="text-meta text-danger-ink">
          {error}
        </p>
      )}
      {compact ? null : <div className="flex justify-end">{button}</div>}
    </form>
  )
  if (compact) {
    return (
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerTrigger asChild>{trigger}</DrawerTrigger>
        <DrawerContent aria-describedby={undefined} data-save-version-sheet="" footer={button}>
          <DrawerTitle className="sr-only">Save version</DrawerTitle>
          <OverlayBody asChild className="mx-0 px-4 pb-2 pt-1">
            <div>{form}</div>
          </OverlayBody>
        </DrawerContent>
      </Drawer>
    )
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-3">
        {form}
      </PopoverContent>
    </Popover>
  )
}
