"use client"

/**
 * The grid's cell pickers: a select's options, a status's in their groups, a
 * date's calendar, a link's search, a people field's members and a long
 * text's editor. A chunk of its own (cellPickerPart, loaded the first time a picker
 * opens and warmed once the table is drawn): a grid of thousands of cells
 * draws its chips and days, never a picker until one opens. Each is mounted
 * while its popover is open, so what was typed into it goes when it closes.
 */

import * as React from "react"
import { Check, Loader2, Search } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { CommandList, type CommandListHandle, type CommandListItem } from "@/components/ui/CommandList"
import { useGlobalSearch, type SearchResult } from "@/services/searchService"
import { linkableCalls, pickRows, SEARCHED_CALLS, type LinkableCall } from "@/services/tableLinkPicks"
import { isAppOffline, subscribeConnectivity } from "@/lib/connectivity"
import { SaysLoadFailure } from "@/lib/http/loadFailure"
import { hitRef } from "@/lib/search/hitRef"
import { HitKindWord } from "@/components/search/hitKindWord"
import type { FieldOption, RelationRef } from "@/services/tableService"
import type { RelationTarget } from "@/lib/fieldTypes/types"
import { campHueOf } from "@/lib/campHue"
import { HUE_CLASS } from "@/components/ui/graphics/hues"
import { cn } from "@/lib/utils/helpers/cn"
import { RefGlyph } from "@/components/table/relationFace"
import { displayNameOf } from "@/lib/personName"
import { PopoverContent } from "@/components/ui/popover"
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxGroup, ComboboxInput, ComboboxItem, ComboboxList, ComboboxSeparator, ComboboxTrigger } from "@/components/ui/combobox"
import { UserComboboxItem } from "@/components/combobox/userComboboxItem"
import { OptionChip } from "@/components/table/optionChip"
import { STATUS_GROUPS, STATUS_GROUP_NAMES, statusGroupOf } from "@/lib/fieldTypes/kindsMore"
import { useFetch } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import { fieldKeyDown } from "@/lib/keys/ime"
import { LONG_TEXT_BOX, caretAtEnd, useLongTextDraft } from "@/components/table/longTextBox"
import type { UserListInterfaceResp } from "@/types/user"

/** An option's tile in a picker: its 6 px dot. */
function OptionDot({ color }: { color?: string }) {
  const hue = campHueOf(color)
  return (
    <span className="inline-flex size-6 items-center justify-center">
      <span aria-hidden="true" className={cn("size-2 rounded-[4px]", hue ? cn(HUE_CLASS[hue], "bg-hue") : "bg-ink-3")} />
    </span>
  )
}

/**
 * A select's or a multi-select's options, found by typing: a pick toggles an
 * option of a multi-select, and chooses (or, by Clear, clears) a select's.
 */
export function OptionPicker({
  name,
  options,
  selected,
  multi,
  onPick,
  onClear,
}: {
  name: string
  options: FieldOption[]
  selected: string[]
  multi: boolean
  onPick: (label: string) => void
  onClear: () => void
}) {
  const [q, setQ] = React.useState("")
  const list = React.useRef<CommandListHandle>(null)
  const items: CommandListItem[] = React.useMemo(() => {
    const ql = q.trim().toLowerCase()
    // Each option by its id; a cell holds the label.
    const out: CommandListItem[] = options
      .filter((o) => !ql || o.label.toLowerCase().includes(ql))
      .map((o) => ({
        id: o.id,
        label: o.label,
        tile: <OptionDot color={o.color} />,
        trailing: selected.includes(o.label) ? <Check className="size-4 text-camp-moss" aria-hidden="true" /> : undefined,
      }))
    if (!multi && selected.length && !ql) out.push({ id: "__clear", label: "Clear", text: "Clear", tile: <span className="size-6" /> })
    return out
  }, [options, q, selected, multi])
  return (
    <CommandList
      ref={list}
      label={`${name} options`}
      className="w-64"
      items={items}
      query={q}
      onSelect={(item) => {
        if (item.id === "__clear") return onClear()
        const label = options.find((o) => o.id === item.id)?.label
        if (label !== undefined) onPick(label)
      }}
      maxHeight={280}
      empty={options.length === 0 ? "No options yet. Add some in the column menu." : `No options match “${q}”`}
      header={
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (list.current?.onKeyDown(e)) e.preventDefault()
          }}
          placeholder={multi ? "Find options" : "Find an option"}
          aria-label="Find an option"
          className="h-7 w-full bg-transparent text-ui text-ink outline-none placeholder:text-ink-3"
        />
      }
    />
  )
}

/** A date's calendar, and Clear. */
export function DayPicker({ day, onPick }: { day: Date | undefined; onPick: (d: Date | undefined) => void }) {
  return (
    <>
      <Calendar mode="single" selected={day} defaultMonth={day} onSelect={onPick} initialFocus />
      <div className="flex justify-end p-2 pt-0">
        <Button variant="ghost" size="xs" disabled={!day} onClick={() => onPick(undefined)}>
          Clear
        </Button>
      </div>
    </>
  )
}

// A unified-search result as a {id,label,type} ref (lib/search/hitRef reads a
// doc, board, task, project or channel hit), scoped to the allowed target type
// ("any" accepts the linkable kinds).
function refFromResult(r: SearchResult, target: RelationTarget): RelationRef | null {
  const accept = (t: string) => target === "any" || target === t
  const hit = hitRef(r)
  if (hit) return accept(hit.kind) ? { id: hit.id, label: hit.title, type: hit.kind } : null
  if (r.type === "user" && r.user?.user_uuid && accept("user"))
    return { id: r.user.user_uuid, label: displayNameOf(r.user) || "User", type: "user" }
  return null
}

/** A call the reader may link, as a ref: its id, and its title as the server names it for them. */
const callRef = (c: LinkableCall): RelationRef => ({ id: c.id, label: c.title, type: "call" })
/** The calls "any" offers after what the search found. */
const ANY_CALLS = 3
const notOffline = () => false

/**
 * A link's picker: a table's rows or the reader's calls, shown before anything
 * is typed and found by name (pickRows, GET /calls/linkable), or items found
 * by search ("any" adds the reader's calls after them). A pick toggles a link;
 * a pick of an item closes the picker. A read that failed says so in place,
 * with Try again; offline, it says so and reads again once the app is back
 * (lib/connectivity, the state hooks/useFetch waits on).
 */
export function RelationPicker({
  refs,
  target,
  rowsOf,
  tableName,
  onToggle,
  onClose,
}: {
  refs: RelationRef[]
  target: RelationTarget
  /** For a link to a table's rows: the table. */
  rowsOf?: string
  tableName?: string
  onToggle: (ref: RelationRef) => void
  onClose: () => void
}) {
  const { search } = useGlobalSearch()
  const [query, setQuery] = React.useState("")
  const [items, setItems] = React.useState<RelationRef[]>([])
  const [loading, setLoading] = React.useState(false)
  const [failed, setFailed] = React.useState(false)
  const [tries, setTries] = React.useState(0)
  const offline = React.useSyncExternalStore(subscribeConnectivity, isAppOffline, notOffline)
  const calls = target === "call"
  // A table's rows and the reader's calls show before anything is typed; anything else is searched for.
  const listsFirst = !!rowsOf || calls
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const reqId = React.useRef(0)
  const list = React.useRef<CommandListHandle>(null)

  React.useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
      reqId.current++ // a search still running is for a picker that's closed
    },
    [],
  )

  React.useEffect(() => {
    const q = query.trim()
    if (timer.current) clearTimeout(timer.current)
    if ((!q && !listsFirst) || offline) {
      reqId.current++ // a search still running was for text that's gone, or can't answer
      if (!offline) setItems([])
      setFailed(false)
      setLoading(false)
      return
    }
    setLoading(true)
    setFailed(false)
    const myReq = ++reqId.current
    timer.current = setTimeout(
      async () => {
        const mapped: RelationRef[] = []
        let failedNow = false
        try {
          if (rowsOf) {
            const rows = await pickRows(rowsOf, q)
            for (const r of rows) mapped.push({ id: r.id, label: r.label, type: "row", table_id: rowsOf })
          } else if (calls) {
            for (const c of await linkableCalls(q)) mapped.push(callRef(c))
          } else {
            // "any" lists the reader's calls after what the search found; a listing that fails leaves the search's.
            const [res, more] = await Promise.all([search(q), target === "any" ? linkableCalls(q).catch(() => []) : []])
            for (const r of res?.page ?? []) {
              const ref = refFromResult(r, target)
              if (ref) mapped.push(ref)
              if (mapped.length >= 8) break
            }
            for (const c of more.slice(0, ANY_CALLS)) mapped.push(callRef(c))
          }
        } catch {
          // Said in place, with Try again (the error state keeps the request's toast quiet).
          failedNow = true
        }
        if (myReq !== reqId.current) return
        setItems(mapped)
        setFailed(failedNow)
        setLoading(false)
      },
      listsFirst && !q ? 0 : 180,
    )
  }, [query, search, target, rowsOf, calls, listsFirst, offline, tries])

  const listItems: CommandListItem[] = items.map((ref) => ({
    id: `${ref.type}-${ref.id}`,
    label: ref.label ?? "",
    text: ref.label ?? "",
    tile: (
      <span className="inline-flex size-6 items-center justify-center">
        <RefGlyph item={ref} />
      </span>
    ),
    trailing: refs.some((x) => x.id === ref.id) ? (
      <Check className="size-4 text-camp-moss" aria-label="Linked" />
    ) : ref.type !== "row" ? (
      <HitKindWord kind={ref.type} />
    ) : undefined,
  }))
  const placeholder = rowsOf ? `Link a row from ${tableName || "the table"}` : `Search ${target === "any" ? "tasks, docs and people" : target + "s"}`
  const q = query.trim()
  const emptyText = failed ? (
    // Said in place (role alert, once), so the request's own toast stays quiet (lib/http/loadFailure).
    <span role="alert" className="flex flex-col items-center gap-2">
      <SaysLoadFailure />
      {`Couldn't load ${rowsOf ? "rows" : calls ? "calls" : "search results"}`}
      <Button type="button" size="sm" variant="outline" onClick={() => setTries((n) => n + 1)}>
        Try again
      </Button>
    </span>
  ) : offline ? (
    "You're offline. This list comes back when you're online."
  ) : loading ? null : !q && !listsFirst ? (
    "Type to search"
  ) : rowsOf && !q ? (
    "That table has no rows yet"
  ) : calls && !q ? (
    "No calls to link yet"
  ) : calls ? (
    `Nothing matches “${q}”. Only your ${SEARCHED_CALLS} newest calls are searched.`
  ) : (
    `Nothing matches “${q}”`
  )

  return (
    <CommandList
      ref={list}
      label="Rows to link"
      roomy
      className="w-80"
      items={listItems}
      query={query}
      maxHeight={300}
      onSelect={(item) => {
        const ref = items.find((r) => `${r.type}-${r.id}` === item.id)
        if (!ref) return
        onToggle(ref)
        if (!rowsOf) onClose()
      }}
      empty={emptyText}
      after={
        loading && !offline ? (
          <div className="flex h-9 items-center gap-2 px-2 text-ui-sm text-ink-3">
            <Loader2 className="size-3.5 animate-spin" /> Searching…
          </div>
        ) : null
      }
      header={
        <span className="flex w-full items-center gap-2">
          <Search className="size-3.5 shrink-0 text-ink-3" aria-hidden="true" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (list.current?.onKeyDown(e)) e.preventDefault()
            }}
            placeholder={placeholder}
            aria-label={placeholder}
            className="h-7 min-w-0 flex-1 bg-transparent text-ui font-normal text-ink outline-none placeholder:text-ink-3"
          />
        </span>
      }
    />
  )
}

/**
 * A status cell's combobox (SA-3, STEP5 spec E): the cell as its trigger and
 * the menu, a list of one in its three groups, each option as its lozenge;
 * Clear at its foot while one is chosen. One root, so where the combobox
 * opens as a sheet (a phone's, DRAWERS-3) this does too.
 */
export function StatusCombobox({
  trigger,
  open,
  onOpenChange,
  name,
  options,
  selected,
  onPick,
  onClear,
}: {
  trigger: React.ReactElement
  open: boolean
  onOpenChange: (open: boolean) => void
  name: string
  options: FieldOption[]
  /** The chosen option's label, "" for none. */
  selected: string
  onPick: (label: string) => void
  onClear: () => void
}) {
  const chosen = options.find((o) => o.label === selected)
  return (
    <Combobox open={open} onOpenChange={onOpenChange}>
      <ComboboxTrigger asChild>{trigger}</ComboboxTrigger>
      <ComboboxContent label={name} selected={chosen?.id} sideOffset={2} data-status-picker="">
        <ComboboxInput placeholder="Find a status…" />
        <ComboboxList>
          <ComboboxEmpty>{options.length ? "No status by that name." : "No options yet. Add some in the column menu."}</ComboboxEmpty>
          {STATUS_GROUPS.map((g) => {
            const inGroup = options.filter((o) => statusGroupOf(o) === g)
            if (!inGroup.length) return null
            return (
              <ComboboxGroup key={g} heading={STATUS_GROUP_NAMES[g]}>
                {inGroup.map((o) => (
                  <ComboboxItem key={o.id} value={o.id} keywords={[o.label]} checked={o.label === selected} onSelect={() => onPick(o.label)}>
                    <OptionChip label={o.label} color={o.color} tinted group={g} />
                  </ComboboxItem>
                ))}
              </ComboboxGroup>
            )
          })}
          {selected ? (
            <>
              <ComboboxSeparator />
              <ComboboxItem value="__clear" keywords={["Clear status"]} onSelect={onClear}>
                Clear status
              </ComboboxItem>
            </>
          ) : null}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}

/**
 * A people cell's combobox (SA-3, STEP5 spec E): the cell as its trigger and
 * the workspace's members as rows, faces and all, found by name, handle or
 * address. A list of many adds and takes away each pick and stays open; a
 * field that takes one person picks one and closes. Someone in the cell the
 * list doesn't hold (who left) stays as they were. One root, as a status's.
 */
export function PeopleCombobox({
  trigger,
  open,
  onOpenChange,
  name,
  refs,
  one,
  onChange,
}: {
  trigger: React.ReactElement
  open: boolean
  onOpenChange: (open: boolean) => void
  name: string
  refs: RelationRef[]
  one: boolean
  onChange: (refs: RelationRef[]) => void
}) {
  const users = useFetch<UserListInterfaceResp>(GetEndpointUrl.GetAllUser)
  const people = React.useMemo(() => (users.data?.users ?? []).filter((u) => !u.is_bot && u.user_uuid), [users.data])
  const chosen = new Set(refs.map((r) => r.id))
  const toggle = (id: string) => {
    const person = people.find((u) => u.user_uuid === id)
    const ref: RelationRef = { id, type: "user", label: person ? displayNameOf(person) : undefined }
    if (one) {
      onChange(chosen.has(id) ? [] : [ref])
      // A field of one is done once someone is picked. The person row
      // (components/combobox/userComboboxItem) is cmdk's own item on web
      // beta, not the combobox's, so the menu doesn't shut itself.
      onOpenChange(false)
    } else onChange(chosen.has(id) ? refs.filter((r) => r.id !== id) : [...refs, ref])
  }
  return (
    <Combobox open={open} onOpenChange={onOpenChange} multiple={!one}>
      <ComboboxTrigger asChild>{trigger}</ComboboxTrigger>
      <ComboboxContent label={name} selected={one ? refs[0]?.id : undefined} sideOffset={2} data-people-picker="">
        <ComboboxInput placeholder="Find someone…" />
        <ComboboxList>
          <ComboboxEmpty>{users.isLoading ? "Finding people…" : "Nobody by that name."}</ComboboxEmpty>
          {people.map((u) => (
            <UserComboboxItem
              key={u.user_uuid}
              userUuid={u.user_uuid}
              userName={displayNameOf(u)}
              userFullName={u.user_full_name}
              userHandle={u.user_handle}
              userEmail={u.user_email_id}
              userProfileObjectKey={u.user_profile_object_key}
              isSelected={chosen.has(u.user_uuid)}
              onSelect={toggle}
            />
          ))}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}

/**
 * A long text's editor (STEP5 spec E): a 320 px box under the cell that grows
 * to eight lines. Enter makes a new line; Cmd or Ctrl+Enter, or a click away,
 * saves; Esc puts it back. Mounted in the cell's popover; on a phone, the
 * cell opens its sheet instead (kindCells' LongTextSheet).
 */
export function LongTextEditor({
  name,
  value,
  onSave,
  onClose,
}: {
  name: string
  value: string
  onSave: (text: string) => void
  onClose: () => void
}) {
  const { text, setText, edited } = useLongTextDraft(value)
  const area = React.useRef<HTMLTextAreaElement>(null)
  const grow = (el: HTMLTextAreaElement) => {
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, 8 * 20 + 16)}px`
  }
  React.useLayoutEffect(() => {
    if (area.current) grow(area.current)
  }, [])
  const saved = React.useRef(false)
  const save = () => {
    if (saved.current) return
    saved.current = true
    if (edited) onSave(text)
  }
  return (
    <PopoverContent
      align="start"
      sideOffset={-32}
      // On screen, 16 px in (the shared default), however near the grid's edge the cell is.
      sticky="always"
      className="w-80 max-w-[calc(100vw-2rem)] rounded-lg p-0 shadow-e3"
      data-long-text-editor=""
      onInteractOutside={save}
      onEscapeKeyDown={() => {
        saved.current = true
        setText(value)
      }}
    >
      <textarea
        ref={area}
        autoFocus
        value={text}
        aria-label={name}
        // Esc puts the text back and closes the box; nothing round it hears it.
        data-escape-own=""
        onChange={(e) => {
          setText(e.target.value)
          grow(e.currentTarget)
        }}
        onFocus={caretAtEnd}
        onKeyDown={fieldKeyDown((e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            save()
            onClose()
          } else if (e.key === "Escape") {
            e.preventDefault()
            saved.current = true
            setText(value)
            onClose()
          }
        })}
        className={cn(LONG_TEXT_BOX, "max-h-[176px] min-h-9 overflow-y-auto md:text-ui")}
      />
    </PopoverContent>
  )
}
