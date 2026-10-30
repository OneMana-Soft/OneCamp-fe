"use client"

/**
 * A table's saved views (migration 512): the menu that lists them, the shared
 * ones for everyone who opens the table and the reader's own, and what saves
 * one. A view is a layout, its sorts and filters, and how its columns draw;
 * the page's tabs and toolbar change those, and here they're named, saved,
 * shared, locked and linked. A chunk of its own, warmed as the table opens.
 *
 * Who may do what is the server's rule, drawn here: a view of one's own is
 * the reader's to change; a shared one, the table's managers', once it's
 * unlocked. Anyone else saves their changes as a view of their own.
 *
 * A change's Save and Reset never move the layout tabs: on a computer they
 * sit after them, in the page's [data-view-actions]; on a phone, where the
 * bar holds only the menu and the tabs, they head the views sheet, and the
 * trigger's dot says there's a change.
 */

import * as React from "react"
import { createPortal } from "react-dom"
import { Button } from "@/components/ui/button"
import { focusHandOff } from "@/lib/ui/focusHandOff"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ResponsiveDialog } from "@/components/ui/responsive-dialog"
import { SegmentedControl } from "@/components/ui/segmentedControl"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Copy, KeyRound, Link2, Lock, Pencil, Plus, RotateCcw, Save, Trash2 } from "@/lib/icons"
import { useSheetMode } from "@/components/ui/overlayMode"
import { useConfirm } from "@/hooks/useConfirm"
import { copyToClipboard } from "@/hooks/useCopyToClipboard"
import { VIEW_LAYOUTS } from "@/components/table/viewLayouts"
import { VIEW_TRIGGER, ViewFace } from "@/components/table/views/ViewFace"
import { StatusDot } from "@/components/ui/statusWord"
import { cn } from "@/lib/utils/helpers/cn"
import { createView, deleteView, lockView, updateView, type ViewInput } from "@/services/tableViews"
import { parseViewConfig, type TableField, type TableView } from "@/services/tableService"
import { loadDisplay, type TableDisplay } from "@/lib/tables/display"
import { loadViewRules, type ViewRules } from "@/lib/tables/viewRules"
import { viewFromQuery, type ViewChoice } from "@/lib/tables/tableView"
import { drawnAs, keepsOwnChange, loadLastView, mayChangeView, openingView, sameViewState, saveLastView, viewConfig, viewStateOf, type ViewState } from "@/lib/tables/savedViews"

/** A name to give: a new view, the reader's copy of one, or a view's new name. */
type Naming = { kind: "new" | "mine" | "copy" | "rename"; title: string; name: string }

export function TableViews({
  tableId,
  views,
  fields,
  canManage,
  layout,
  rules,
  display,
  onApply,
}: {
  tableId: string
  /** The table's views as the reader's bundle lists them: the shared ones, and their own. */
  views: TableView[] | undefined
  fields: TableField[]
  canManage: boolean
  /** How the page shows the table now. */
  layout: ViewChoice
  rules: ViewRules
  display: TableDisplay
  /** Shows the table as a view keeps it. */
  onApply: (state: ViewState) => void
}) {
  const confirm = useConfirm()
  const [list, setList] = React.useState(views ?? [])
  React.useEffect(() => setList(views ?? []), [views])
  const [chosen, setChosen] = React.useState<string | null>(null)
  const [open, setOpen] = React.useState(false)
  const [naming, setNaming] = React.useState<Naming | null>(null)
  const busy = React.useRef(false)
  const [writing, setWriting] = React.useState(false)
  const sheet = useSheetMode()
  const root = React.useRef<HTMLDivElement>(null)
  const [actionsAt, setActionsAt] = React.useState<Element | null>(null)
  React.useLayoutEffect(() => setActionsAt(root.current?.parentElement?.querySelector("[data-view-actions]") ?? null), [])

  // The view the table opens in: the one its link names, else the reader's
  // last, else the first. It shows as it's saved, before the page paints,
  // unless this device holds a change of the reader's own to it, which shows
  // as they left it (V-53: a view saved at 1280 opened on a phone as nothing).
  React.useLayoutEffect(() => {
    const url = new URL(window.location.href)
    const named = url.searchParams.get("v")
    const last = loadLastView(tableId)
    const opening = openingView(views ?? [], named, last?.id ?? null)
    setChosen(opening?.id ?? null)
    if (!opening) return
    const layout = url.searchParams.get("view")
    const kept = { layout: layout === null ? null : viewFromQuery(layout), rules: loadViewRules(tableId, fields), display: loadDisplay(tableId) }
    if (opening.id !== named && keepsOwnChange(opening, last, kept, fields)) return
    const state = viewStateOf(opening, fields)
    saveLastView(tableId, opening.id, state)
    onApply(state)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, as the table opens
  }, [])

  const current = list.find((v) => v.id === chosen) ?? null
  const now: ViewState = { layout, rules, display: drawnAs(display) }
  const changed = !!current && !sameViewState(viewStateOf(current, fields), now)
  const mayChange = !!current && mayChangeView(current, canManage)

  // The view chosen, kept with the state it shows in, which tells a change of the reader's own from one saved elsewhere since.
  const choose = (view: TableView, state: ViewState) => {
    setChosen(view.id)
    saveLastView(tableId, view.id, state)
    const url = new URL(window.location.href)
    url.searchParams.set("v", view.id)
    url.searchParams.delete("view")
    window.history.replaceState(window.history.state, "", url)
  }
  const pick = (view: TableView) => {
    const state = viewStateOf(view, fields)
    choose(view, state)
    onApply(state)
  }

  // One write at a time: a second click while one is on its way does nothing.
  const write = async (run: () => Promise<void>) => {
    if (busy.current) return
    busy.current = true
    setWriting(true)
    try {
      await run()
    } catch {
      // The server's own words are already in a toast (the request's interceptor).
    } finally {
      busy.current = false
      setWriting(false)
    }
  }
  const input = (view: TableView, patch: Partial<ViewInput>): ViewInput => ({ name: view.name, type: view.type, config: parseViewConfig(view), position: view.position, ...patch })
  const save = () =>
    write(async () => {
      if (!current) return
      const next = input(current, { type: now.layout, config: viewConfig(now) })
      await updateView(tableId, current.id, next)
      saveLastView(tableId, current.id, now)
      setList((l) => l.map((v) => (v.id === current.id ? { ...v, type: next.type, config: JSON.stringify(next.config) } : v)))
    })
  const named = (n: Naming, name: string, everyone: boolean) =>
    write(async () => {
      if (n.kind === "rename" && current) {
        await updateView(tableId, current.id, input(current, { name }))
        setList((l) => l.map((v) => (v.id === current.id ? { ...v, name } : v)))
      } else {
        // A copy is the view as it's saved; a new view, or the reader's own of the one changed, is the table as it's shown now.
        const from = n.kind === "copy" && current ? viewStateOf(current, fields) : now
        const position = Math.max(0, ...list.map((v) => v.position)) + 1
        const made = await createView(tableId, { name, type: from.layout, config: viewConfig(from), position, personal: !everyone })
        setList((l) => [...l, made])
        if (n.kind === "copy") pick(made)
        else choose(made, from)
      }
      setNaming(null)
    })
  const saveAsMine = () => current && setNaming({ kind: "mine", title: "Save as my view", name: `${current.name} (mine)` })
  // A pick that opens a dialog leaves the focus to it (New view's sheet kept its Name, a phone its keyboard).
  const [handOff] = React.useState(focusHandOff)
  const reset = () => {
    if (!current) return
    const state = viewStateOf(current, fields)
    saveLastView(tableId, current.id, state)
    onApply(state)
  }
  const remove = () =>
    current &&
    confirm({
      title: `Delete the view “${current.name}”?`,
      description: current.owner_id ? "It's yours alone, so no one else loses it." : "It's gone for everyone who opens this table. The table and its rows stay.",
      confirmText: "Delete view",
      destructive: true,
      onConfirm: () =>
        write(async () => {
          await deleteView(tableId, current.id)
          const rest = list.filter((v) => v.id !== current.id)
          setList(rest)
          if (rest[0]) pick(rest[0])
          else setChosen(null)
        }),
    })
  const lock = () =>
    write(async () => {
      if (!current) return
      await lockView(tableId, current.id, !current.locked)
      setList((l) => l.map((v) => (v.id === current.id ? { ...v, locked: !current.locked } : v)))
    })
  const copyLink = () => {
    if (!current) return
    const url = new URL(window.location.href)
    url.search = ""
    url.searchParams.set("v", current.id)
    void copyToClipboard(url.toString(), "Link to the view copied")
  }

  const shared = list.filter((v) => !v.owner_id)
  const mine = list.filter((v) => v.owner_id)
  const item = (v: TableView) => {
    const ViewIcon = VIEW_LAYOUTS.find((l) => l.type === v.type)?.icon ?? VIEW_LAYOUTS[0].icon
    return (
      <DropdownMenuRadioItem key={v.id} value={v.id} className="gap-2">
        <ViewIcon aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">{v.name}</span>
        {v.locked ? <Lock aria-label="Locked" className="text-ink-3" /> : null}
      </DropdownMenuRadioItem>
    )
  }

  return (
    <div ref={root} className="flex shrink-0 items-center" data-table-views="">
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            data-touch-target=""
            aria-label={`View: ${current?.name ?? "none saved"}${changed ? ", changed" : ""}`}
            className={cn(VIEW_TRIGGER, "hover:bg-hover focus-visible:focus-halo")}
          >
            <ViewFace view={current} layout={layout}>
              {changed ? <StatusDot className="bg-camp-sun" /> : null}
            </ViewFace>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="content-float w-64 rounded-xl p-1 shadow-e3"
          onCloseAutoFocus={handOff.onCloseAutoFocus}
        >
          {sheet && changed && current ? (
            <>
              {mayChange ? (
                <DropdownMenuItem onSelect={() => void save()}>
                  <Save /> Save
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onSelect={handOff.to(saveAsMine)}>
                  <Save /> Save as mine
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={reset}>
                <RotateCcw /> Reset
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          ) : null}
          <DropdownMenuRadioGroup
            value={chosen ?? ""}
            onValueChange={(id) => {
              const view = list.find((v) => v.id === id)
              if (view) pick(view)
            }}
          >
            {shared.length ? <DropdownMenuLabel>Everyone</DropdownMenuLabel> : null}
            {shared.map(item)}
            {mine.length ? <DropdownMenuLabel>Only me</DropdownMenuLabel> : null}
            {mine.map(item)}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={handOff.to(() => setNaming({ kind: "new", title: "New view", name: "" }))}>
            <Plus /> New view
          </DropdownMenuItem>
          {current ? (
            <>
              {mayChange ? (
                <DropdownMenuItem onSelect={handOff.to(() => setNaming({ kind: "rename", title: "Rename view", name: current.name }))}>
                  <Pencil /> Rename
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem onSelect={handOff.to(() => setNaming({ kind: "copy", title: "Duplicate as mine", name: `${current.name} (mine)` }))}>
                <Copy /> Duplicate as mine
              </DropdownMenuItem>
              {canManage && !current.owner_id ? (
                <DropdownMenuItem onSelect={() => void lock()}>
                  {current.locked ? <KeyRound /> : <Lock />} {current.locked ? "Unlock view" : "Lock view"}
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem onSelect={copyLink}>
                <Link2 /> Copy link
              </DropdownMenuItem>
              {mayChange ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={handOff.to(remove)} className="text-danger-ink focus:text-danger-ink">
                    <Trash2 /> Delete view
                  </DropdownMenuItem>
                </>
              ) : null}
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      {changed && current && !sheet && actionsAt
        ? createPortal(
            // Secondary: the page's one orange action is New row.
            <div className="ml-auto flex shrink-0 items-center gap-1.5">
              {mayChange ? (
                <Button size="sm" variant="secondary" busy={writing} onClick={() => void save()}>
                  Save
                </Button>
              ) : (
                <Button size="sm" variant="secondary" onClick={saveAsMine}>
                  Save as mine
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={reset}>
                Reset
              </Button>
            </div>,
            actionsAt,
          )
        : null}
      {naming ? <ViewName naming={naming} canShare={canManage && naming.kind === "new"} busy={writing} onSave={(name, everyone) => void named(naming, name, everyone)} onClose={() => setNaming(null)} /> : null}
    </div>
  )
}

/** A view's name to give, and for a new one a manager makes, who sees it. */
function ViewName({ naming, canShare, busy, onSave, onClose }: { naming: Naming; canShare: boolean; busy: boolean; onSave: (name: string, everyone: boolean) => void; onClose: () => void }) {
  const [name, setName] = React.useState(naming.name)
  const [who, setWho] = React.useState<"me" | "everyone">("me")
  const ready = name.trim() !== ""
  const save = () => ready && onSave(name.trim(), who === "everyone")
  return (
    <ResponsiveDialog
      title={naming.title}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!ready} busy={busy} onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="view-name">Name</Label>
          <Input
            id="view-name"
            autoFocus
            value={name}
            maxLength={120}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) save()
            }}
          />
        </div>
        {canShare ? (
          <div className="flex flex-col gap-1.5">
            <Label id="view-who">Who sees it</Label>
            <SegmentedControl
              aria-labelledby="view-who"
              className="self-start"
              value={who}
              onValueChange={setWho}
              options={[
                { value: "me", label: "Only me" },
                { value: "everyone", label: "Everyone" },
              ]}
            />
          </div>
        ) : null}
      </div>
    </ResponsiveDialog>
  )
}
