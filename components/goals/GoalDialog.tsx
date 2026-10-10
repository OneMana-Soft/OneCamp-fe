"use client"

import { useMemo, useState } from "react"
import { UserComboboxItem } from "@/components/combobox/userComboboxItem"
import { GoalOwner } from "@/components/goals/GoalOwner"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useFetch, useFetchOnlyOnce } from "@/hooks/useFetch"
import { useGoal, useGoals } from "@/hooks/useGoals"
import { useProjectsOverview } from "@/hooks/useProjectsOverview"
import { Check, ChevronsUpDown, Loader2, X } from "@/lib/icons"
import { MEASURES, parentChoices, quarterEnd, type GoalDetail, type GoalInput, type GoalSummary, type Measure } from "@/lib/goals"
import { cn } from "@/lib/utils/helpers/cn"
import { GetEndpointUrl } from "@/services/endPoints"
import type { UserListInterfaceResp, UserProfileInterface } from "@/types/user"

const NO_PARENT = "none"

/** A form's number: a finite number, or undefined for empty or nonsense. */
const num = (s: string) => (s.trim() === "" || !Number.isFinite(Number(s)) ? undefined : Number(s))

/**
 * Making or changing a goal: what it is, who owns it, when it's due, how its
 * progress is measured, and where it sits under another goal. A new goal can
 * start with the projects that serve it; afterwards they are added on its page.
 */
export function GoalDialog({
  goals,
  editing,
  parentId,
  onClose,
  onSaved,
}: {
  /** Every goal, for choosing a parent. */
  goals: GoalSummary[]
  editing?: GoalDetail
  /** A new sub-goal's parent. */
  parentId?: string
  onClose: () => void
  onSaved: (goal: GoalSummary) => void
}) {
  const { create } = useGoals()
  const { edit } = useGoal(editing?.id)
  const self = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)
  const me = self.data?.data
  const users = useFetch<UserListInterfaceResp>(GetEndpointUrl.GetAllUser)
  const { projects } = useProjectsOverview()

  const [title, setTitle] = useState(editing?.title ?? "")
  const [description, setDescription] = useState(editing?.description ?? "")
  const [owner, setOwner] = useState(editing?.owner.user_uuid ?? "")
  const [due, setDue] = useState(editing?.due_date ?? quarterEnd())
  const [start, setStart] = useState(editing?.start_date ?? "")
  const [measure, setMeasure] = useState<Measure>(editing?.measure ?? "projects")
  const [startValue, setStartValue] = useState(editing?.start_value?.toString() ?? "")
  const [target, setTarget] = useState(editing?.target_value?.toString() ?? "")
  const [initialCurrent] = useState(editing?.current_value?.toString() ?? "")
  const [current, setCurrent] = useState(initialCurrent)
  const [unit, setUnit] = useState(editing?.unit ?? "")
  const [parent, setParent] = useState(editing?.parent_id ?? parentId ?? NO_PARENT)
  const [linked, setLinked] = useState<string[]>([])
  const [ownerOpen, setOwnerOpen] = useState(false)
  const [projectsOpen, setProjectsOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState("")

  const people = useMemo(() => (users.data?.users ?? []).filter((u) => !u.is_bot && u.user_uuid), [users.data])
  const ownerId = owner || me?.user_uuid || ""
  const ownerUser = people.find((u) => u.user_uuid === ownerId) ?? (me && me.user_uuid === ownerId ? me : undefined)
  const parents = useMemo(() => parentChoices(goals, editing?.id, editing?.parent_id), [goals, editing?.id, editing?.parent_id])
  const projectName = (id: string) => projects?.find((p) => p.project_uuid === id)?.project_name ?? "A project"

  const check = (): string => {
    if (!title.trim()) return "Give the goal a title."
    if (!due) return "Choose the date the goal is due."
    if (start && start > due) return "A goal can't start after it's due."
    if (measure === "number") {
      const s = num(startValue)
      const t = num(target)
      if (s === undefined || t === undefined) return "Give the number where it starts and its target."
      if (s === t) return "The target has to differ from where the number starts."
    }
    return ""
  }

  const save = async () => {
    const why = check()
    setProblem(why)
    if (why || busy) return
    const input: GoalInput = {
      title,
      description,
      owner_uuid: ownerId,
      parent_id: parent === NO_PARENT ? "" : parent,
      start_date: start,
      due_date: due,
      measure,
      unit: measure === "number" ? unit : "",
      ...(measure === "number"
        ? {
            start_value: num(startValue),
            target_value: num(target),
            // Check-ins move the number. An edit sends it only when changed here, so
            // it never puts back what it was when this dialog opened.
            ...(editing?.measure === "number" && current === initialCurrent ? {} : { current_value: num(current) ?? num(startValue) }),
          }
        : {}),
      ...(editing ? {} : { project_uuids: linked }),
    }
    setBusy(true)
    try {
      onSaved(editing ? await edit(input) : await create(input))
    } catch {
      // The server's message is shown already.
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit the goal" : parentId ? "New sub-goal" : "New goal"}</DialogTitle>
          <DialogDescription>An outcome you&apos;re after by a date, with one person who owns it.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-5"
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="goal-title">Goal</Label>
            <Input id="goal-title" value={title} maxLength={200} autoFocus placeholder="Reach 500 paying teams" onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-1.5">
              <Label>Owner</Label>
              <Popover open={ownerOpen} onOpenChange={setOwnerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={ownerOpen}
                    aria-label="Owner"
                    className="h-9 justify-between px-2 font-normal"
                  >
                    {ownerUser ? <GoalOwner owner={ownerUser} /> : <span className="text-muted-foreground">Choose…</span>}
                    <ChevronsUpDown className="ml-1 h-4 w-4 shrink-0 opacity-40" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent portalled={false} className="w-64 p-0">
                  <Command>
                    <CommandInput placeholder="Search people…" className="h-9" />
                    <CommandList>
                      <CommandEmpty>No one found</CommandEmpty>
                      <CommandGroup>
                        {people.map((u) => (
                          <UserComboboxItem
                            key={u.user_uuid}
                            userUuid={u.user_uuid}
                            userName={u.user_full_name || u.user_name}
                            userEmail={u.user_email_id}
                            userProfileObjectKey={u.user_profile_object_key}
                            isSelected={ownerId === u.user_uuid}
                            onSelect={(id) => {
                              setOwner(id)
                              setOwnerOpen(false)
                            }}
                          />
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="goal-due">Due</Label>
              <Input id="goal-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} className="h-9" required />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="goal-start">
                Starts <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input id="goal-start" type="date" value={start} max={due || undefined} onChange={(e) => setStart(e.target.value)} className="h-9" />
            </div>
          </div>

          <fieldset className="grid gap-2">
            <legend className="mb-1.5 text-sm font-medium">Progress comes from</legend>
            <div role="radiogroup" aria-label="Progress comes from" className="grid gap-2 sm:grid-cols-3">
              {MEASURES.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  role="radio"
                  aria-checked={measure === m.value}
                  onClick={() => setMeasure(m.value)}
                  className={cn(
                    "flex flex-col gap-1 rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
                    measure === m.value ? "border-primary bg-primary/5" : "border-border/70 hover:bg-accent",
                  )}
                >
                  <span className="text-sm font-medium">{m.label}</span>
                  <span className="text-xs text-muted-foreground">{m.hint}</span>
                </button>
              ))}
            </div>
          </fieldset>

          {measure === "number" && (
            <div className="grid gap-4 sm:grid-cols-4">
              <div className="grid gap-1.5">
                <Label htmlFor="goal-from">Starts at</Label>
                <Input
                  id="goal-from"
                  type="number"
                  step="any"
                  inputMode="decimal"
                  value={startValue}
                  placeholder="320"
                  onChange={(e) => setStartValue(e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="goal-target">Target</Label>
                <Input
                  id="goal-target"
                  type="number"
                  step="any"
                  inputMode="decimal"
                  value={target}
                  placeholder="500"
                  onChange={(e) => setTarget(e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="goal-now">Now</Label>
                <Input
                  id="goal-now"
                  type="number"
                  step="any"
                  inputMode="decimal"
                  value={current}
                  placeholder={startValue || "320"}
                  onChange={(e) => setCurrent(e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="goal-unit">Unit</Label>
                <Input id="goal-unit" value={unit} maxLength={24} placeholder="teams, $, hours, %" onChange={(e) => setUnit(e.target.value)} className="h-9" />
              </div>
            </div>
          )}

          {!editing && (
            <div className="grid gap-1.5">
              <Label>Projects serving it{measure !== "projects" && <span className="font-normal text-muted-foreground"> (optional)</span>}</Label>
              <div className="flex flex-wrap items-center gap-1.5">
                {linked.map((id) => (
                  <span key={id} className="inline-flex h-7 items-center gap-1 rounded-full bg-muted pl-2.5 pr-1 text-xs">
                    {projectName(id)}
                    <button
                      type="button"
                      aria-label={`Remove ${projectName(id)}`}
                      onClick={() => setLinked(linked.filter((p) => p !== id))}
                      className="rounded-full p-0.5 hover:bg-background"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                <Popover open={projectsOpen} onOpenChange={setProjectsOpen}>
                  <PopoverTrigger asChild>
                    <Button type="button" variant="outline" size="sm" className="h-7 text-xs">
                      Add a project
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent portalled={false} className="w-64 p-0">
                    <Command>
                      <CommandInput placeholder="Search your projects…" className="h-9" />
                      <CommandList>
                        <CommandEmpty>No project found</CommandEmpty>
                        <CommandGroup>
                          {(projects ?? []).map((p) => (
                            <CommandItem
                              key={p.project_uuid}
                              value={`${p.project_name} ${p.project_uuid}`}
                              onSelect={() => {
                                setLinked(linked.includes(p.project_uuid) ? linked.filter((x) => x !== p.project_uuid) : [...linked, p.project_uuid])
                              }}
                            >
                              <span className="truncate">{p.project_name}</span>
                              <Check className={cn("ml-auto h-4 w-4", linked.includes(p.project_uuid) ? "opacity-100" : "opacity-0")} />
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              {measure === "projects" && linked.length === 0 && (
                <p className="text-xs text-muted-foreground">Add them now or from the goal&apos;s page. Only projects you&apos;re in are listed.</p>
              )}
            </div>
          )}

          <div className="grid gap-1.5">
            <Label>Under</Label>
            <Select value={parent} onValueChange={setParent}>
              <SelectTrigger className="h-9" aria-label="Under">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_PARENT}>No other goal: a top goal</SelectItem>
                {parents.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="goal-description">
              Why it matters <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="goal-description"
              value={description}
              maxLength={4000}
              rows={3}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What it changes for the team or its customers, and how you'll know."
            />
          </div>

          {problem && (
            <p role="alert" className="text-sm text-destructive">
              {problem}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {editing ? "Save" : "Create goal"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
