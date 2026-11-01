"use client"

// The plan's chips (linear-15), a chunk of its own that ProjectPlanStrip loads
// once the plan is read. It is handed everything, so it imports none of the
// shared core (main's chunking rule, 30 Oct). Status, lead and labels pick
// from the shared combobox, a sheet on a phone; priority and dates open the
// pickers' chunk (ProjectPlanPickers), fetched as the pointer or the focus
// reaches their chip. A part that isn't set shows as a quiet chip only to
// whoever may set it; everyone else sees what is set. The lead's chip opens
// for the project's admins only.

import dynamic from "next/dynamic"
import { useMemo, useState, type ReactNode } from "react"
import { TaskPriorityCell } from "@/components/task/taskPriorityCell"
import { HueDot } from "@/components/ui/chip"
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxGroup, ComboboxInput, ComboboxItem, ComboboxList, ComboboxTrigger } from "@/components/ui/combobox"
import { IdentityMark } from "@/components/ui/graphics/IdentityMark"
import { ProjectStatusGlyph } from "@/components/ui/graphics/projectStatusGlyph"
import { Popover, PopoverTrigger } from "@/components/ui/popover"
import { StatusDot } from "@/components/ui/statusWord"
import { CalendarRange, CircleUser, Plus, Tag } from "@/lib/icons"
import { statusHueOf } from "@/lib/taskStatus"
import { avatarSeed } from "@/lib/utils/getAvatarColor"
import { cn } from "@/lib/utils/helpers/cn"
import { displayNameOf, personKeywords } from "@/lib/personName"
import { MOST_PLAN_LABELS, PLAN_CATEGORIES, categoryKind, nextLabelColor, spanWords, type PlanField, type PlanMember, type PlanPick, type PlanRegistry, type ProjectPlan } from "@/lib/work/projectPlan"

const PlanPopover = dynamic(() => import("@/components/project/ProjectPlanPickers").then((m) => m.PlanPopover), { ssr: false })
/** Fetches the pickers' chunk as the pointer or the focus reaches a chip that opens one, so a first open doesn't wait. */
const fetchPickers = () => void import("@/components/project/ProjectPlanPickers")

/** The shared chip at the row's height: a pointer and a finger both find it. */
const chip = "chip h-7 min-w-0 shrink-0 gap-1.5 text-xs text-ink-2"
const ghost = "text-ink-3"
/** How many labels the chip names before "+n". */
const LABELS_SHOWN = 2
const nameOf = (m: PlanMember) => displayNameOf(m)

type Opened = { open: boolean; onOpenChange: (open: boolean) => void }

/** A label's colour as a chip carries it: its camp hue's dot, or the quiet dot for slate. */
function LabelDot({ color }: { color: string }) {
  const hue = statusHueOf(color)
  return hue === "neutral" ? <StatusDot tone="neutral" /> : <HueDot hue={hue} />
}

/** The chip that opens a part's picker, named by what it shows; approach fetches the pickers' chunk. */
function opener(field: PlanField, label: string, face: ReactNode, approach = false) {
  return (
    <button
      type="button"
      data-plan-field={field}
      data-touch-target=""
      aria-label={label}
      className={cn(chip, "transition-colors hover:bg-press hover:text-foreground")}
      {...(approach && { onPointerEnter: fetchPickers, onFocus: fetchPickers })}
    >
      {face}
    </button>
  )
}

export interface PlanChipsProps {
  plan: ProjectPlan
  canEdit: boolean
  canLead: boolean
  members: PlanMember[]
  /** The workspace's statuses and labels, read once their picker opens. */
  registry: PlanRegistry | undefined
  /** The shell's error state with Try again, while that read has failed. */
  registryError: ReactNode
  open: PlanField | null
  onOpen: (field: PlanField | null) => void
  onPick: PlanPick
}

export function PlanChips({ plan, canEdit, canLead, members, registry, registryError, open, onOpen, onPick }: PlanChipsProps) {
  const opened = (field: PlanField): Opened => ({ open: open === field, onOpenChange: (o) => onOpen(o ? field : null) })
  /** What a part shows: its picker's chip for whoever may change it, else the part as it reads. */
  const part = (field: PlanField, label: string, face: ReactNode, editable: boolean, picker: (chipEl: ReactNode) => ReactNode, approach = false) =>
    editable ? (
      picker(opener(field, label, face, approach))
    ) : (
      <span data-plan-field={field} className={chip} title={label}>
        {face}
      </span>
    )

  const labels = plan.labels ?? []
  const dates = spanWords(plan.start, plan.target)
  return (
    <>
      {part(
        "status",
        `Status: ${plan.status.name}`,
        <>
          {/* A built-in draws in its category's own ink; a workspace status in its hue. */}
          <ProjectStatusGlyph status={categoryKind(plan.status.category)} hue={plan.status.id ? statusHueOf(plan.status.color) : undefined} size={14} />
          <span className="truncate text-foreground">{plan.status.name}</span>
        </>,
        canEdit,
        (chipEl) => <StatusPicker plan={plan} registry={registry} registryError={registryError} onPick={onPick} opened={opened("status")} chipEl={chipEl} />,
      )}
      {(plan.priority || canEdit) &&
        part(
          "priority",
          plan.priority ? `Priority: ${plan.priority}` : "Set a priority",
          <TaskPriorityCell priority={plan.priority} size={14} className={cn("gap-1.5 text-xs", plan.priority ? "text-foreground" : ghost)} />,
          canEdit,
          (chipEl) => <PopoverPart field="priority" plan={plan} onPick={onPick} opened={opened("priority")} chipEl={chipEl} />,
          true,
        )}
      {(plan.lead || canLead) &&
        part(
          "lead",
          plan.lead ? `Lead: ${plan.lead.name}` : "Choose a lead",
          plan.lead ? (
            <>
              <IdentityMark variant="avatar" size={16} id={avatarSeed(plan.lead.name)} label={plan.lead.name} />
              <span className="max-w-[140px] truncate text-foreground">{plan.lead.name}</span>
            </>
          ) : (
            <>
              <CircleUser aria-hidden="true" className="size-3.5" />
              <span className={ghost}>Lead</span>
            </>
          ),
          canLead,
          (chipEl) => <LeadPicker plan={plan} members={members} onPick={onPick} opened={opened("lead")} chipEl={chipEl} />,
        )}
      {(dates || canEdit) &&
        part(
          "dates",
          dates ? `Dates: ${dates}` : "Set dates",
          <>
            <CalendarRange aria-hidden="true" className="size-3.5" />
            <span className={cn("whitespace-nowrap tabular-nums", dates ? "text-foreground" : ghost)}>{dates || "Dates"}</span>
          </>,
          canEdit,
          (chipEl) => <PopoverPart field="dates" plan={plan} onPick={onPick} opened={opened("dates")} chipEl={chipEl} />,
          true,
        )}
      {(labels.length > 0 || canEdit) &&
        part(
          "labels",
          labels.length ? `Labels: ${labels.map((l) => l.name).join(", ")}` : "Add labels",
          labels.length ? (
            <>
              {labels.slice(0, LABELS_SHOWN).map((l) => (
                <span key={l.id} className="flex min-w-0 items-center gap-1">
                  <LabelDot color={l.color} />
                  <span className="max-w-[96px] truncate text-foreground">{l.name}</span>
                </span>
              ))}
              {labels.length > LABELS_SHOWN && <span className="tabular-nums text-ink-3">+{labels.length - LABELS_SHOWN}</span>}
            </>
          ) : (
            <>
              <Tag aria-hidden="true" className="size-3.5" />
              <span className={ghost}>Labels</span>
            </>
          ),
          canEdit,
          (chipEl) => <LabelsPicker plan={plan} registry={registry} registryError={registryError} onPick={onPick} opened={opened("labels")} chipEl={chipEl} />,
        )}
    </>
  )
}

interface PickerProps {
  plan: ProjectPlan
  onPick: PlanPick
  opened: Opened
  chipEl: ReactNode
}

/** Priority's and the dates' chip: the shared popover, whose picker comes from the pickers' chunk once it opens. */
function PopoverPart({ field, plan, onPick, opened, chipEl }: PickerProps & { field: "priority" | "dates" }) {
  return (
    <Popover {...opened}>
      <PopoverTrigger asChild>{chipEl}</PopoverTrigger>
      {opened.open && <PlanPopover field={field} plan={plan} onPick={onPick} />}
    </Popover>
  )
}

/** Each category's built-in status, then the workspace's own in it, in their order: a task's status picker's look. */
function StatusPicker({ plan, registry, registryError, onPick, opened, chipEl }: PickerProps & { registry: PlanRegistry | undefined; registryError: ReactNode }) {
  const own = registry?.statuses ?? []
  return (
    <Combobox {...opened}>
      <ComboboxTrigger asChild>{chipEl}</ComboboxTrigger>
      <ComboboxContent label="Status">
        <ComboboxInput placeholder="Change status…" />
        <ComboboxList>
          <ComboboxEmpty>No status matches.</ComboboxEmpty>
          {PLAN_CATEGORIES.map((c) => {
            const color = registry?.categories.find((k) => k.key === c.key)?.color ?? "slate"
            return (
              <ComboboxGroup key={c.key}>
                <ComboboxItem
                  value={c.key}
                  keywords={[c.name]}
                  checked={!plan.status.id && plan.status.category === c.key}
                  onSelect={() => onPick({ status: c.key }, { status: { category: c.key, name: c.name, color } })}
                >
                  <ProjectStatusGlyph status={c.kind} size={14} />
                  <span className="truncate">{c.name}</span>
                </ComboboxItem>
                {own
                  .filter((s) => s.category === c.key)
                  .sort((a, b) => a.position - b.position)
                  .map((s) => (
                    <ComboboxItem
                      key={s.id}
                      value={s.id}
                      keywords={[s.name]}
                      checked={plan.status.id === s.id}
                      onSelect={() => onPick({ status: s.id }, { status: { category: s.category, id: s.id, name: s.name, color: s.color } })}
                    >
                      <ProjectStatusGlyph status={c.kind} hue={statusHueOf(s.color)} size={14} />
                      <span className="truncate">{s.name}</span>
                    </ComboboxItem>
                  ))}
              </ComboboxGroup>
            )
          })}
        </ComboboxList>
        {registryError}
      </ComboboxContent>
    </Combobox>
  )
}

/** The project's admins and members, by name; never a guest, a bot, a viewer or a commenter (the server refuses them). */
function LeadPicker({ plan, members, onPick, opened, chipEl }: PickerProps & { members: PlanMember[] }) {
  const people = useMemo(
    () =>
      members
        .filter((m) => !m.is_external && !m.is_bot && m.user_project_role !== "viewer" && m.user_project_role !== "commenter")
        .sort((a, b) => nameOf(a).localeCompare(nameOf(b), undefined, { sensitivity: "base" })),
    [members],
  )
  const current = plan.lead?.user_uuid.toLowerCase()
  return (
    <Combobox {...opened}>
      <ComboboxTrigger asChild>{chipEl}</ComboboxTrigger>
      <ComboboxContent label="Lead">
        <ComboboxInput placeholder="Choose a lead…" />
        <ComboboxList>
          <ComboboxEmpty>No member matches.</ComboboxEmpty>
          <ComboboxItem value="no lead" checked={!current} onSelect={() => onPick({ lead_uuid: null }, { lead: null })}>
            <span className="truncate text-ink-3">No lead</span>
          </ComboboxItem>
          {people.map((m) => (
            <ComboboxItem
              key={m.user_uuid}
              value={m.user_uuid}
              keywords={personKeywords(m)}
              checked={m.user_uuid.toLowerCase() === current}
              onSelect={() => onPick({ lead_uuid: m.user_uuid }, { lead: { user_uuid: m.user_uuid, name: nameOf(m) } })}
            >
              <IdentityMark variant="avatar" size={16} id={avatarSeed(nameOf(m))} label={nameOf(m)} />
              <span className="truncate">{nameOf(m)}</span>
            </ComboboxItem>
          ))}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}

/** The workspace's labels to tick, and a new one made from what's typed (it joins the workspace's list). */
function LabelsPicker({ plan, registry, registryError, onPick, opened, chipEl }: PickerProps & { registry: PlanRegistry | undefined; registryError: ReactNode }) {
  const [query, setQuery] = useState("")
  const all = registry?.labels ?? []
  const on = new Set((plan.labels ?? []).map((l) => l.id))
  const full = on.size >= MOST_PLAN_LABELS
  const name = query.trim().replace(/\s+/g, " ")
  const taken = all.some((l) => l.name.toLowerCase() === name.toLowerCase())
  const toggle = (id: string) => {
    const next = on.has(id) ? [...on].filter((x) => x !== id) : [...on, id]
    onPick({ labels: next }, { labels: all.filter((l) => next.includes(l.id)) }, true)
  }
  const make = () => {
    onPick({ labels: [...on], new_labels: [{ name, color: nextLabelColor(all.length) }] }, {}, true)
    setQuery("")
  }
  return (
    <Combobox
      multiple
      open={opened.open}
      onOpenChange={(o) => {
        opened.onOpenChange(o)
        if (!o) setQuery("")
      }}
    >
      <ComboboxTrigger asChild>{chipEl}</ComboboxTrigger>
      <ComboboxContent label="Labels">
        {/* Not knowing the workspace's labels, it can't tell a new one from one that exists: a failed read offers Try again, never Make. */}
        {registryError ?? (
          <>
            <ComboboxInput value={query} onValueChange={setQuery} placeholder="Find or make a label…" maxLength={40} />
            <ComboboxList>
              <ComboboxEmpty>{registry ? (name ? "No label matches." : "No labels yet: type a name to make one.") : "Reading the labels…"}</ComboboxEmpty>
              {all.map((l) => {
                const has = on.has(l.id)
                return (
                  <ComboboxItem key={l.id} value={l.id} keywords={[l.name]} checked={has} disabled={!has && full} onSelect={() => toggle(l.id)}>
                    <LabelDot color={l.color} />
                    <span className="truncate">{l.name}</span>
                  </ComboboxItem>
                )
              })}
              {registry && name && !taken && !full && (
                <ComboboxItem value={`__make__${name}`} onSelect={make}>
                  <Plus aria-hidden="true" className="size-3.5 text-ink-3" />
                  <span className="truncate">Make “{name}”</span>
                </ComboboxItem>
              )}
            </ComboboxList>
            {full && <p className="border-t border-line px-2 pt-1.5 text-xs text-ink-3">A project carries at most {MOST_PLAN_LABELS} labels.</p>}
          </>
        )}
      </ComboboxContent>
    </Combobox>
  )
}
