"use client"

import React, { useCallback, useEffect, useRef, useState } from "react"
import { fieldKeyDown } from "@/lib/keys/ime"

import { ArrowUpRight, Check, Plus } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { panelSection } from "@/lib/ui/propertyRow"
import { celebrateRing, prefersReducedMotion } from "@/lib/celebrate"
import { Bar } from "@/components/ui/progress"
import { DueLabel } from "@/components/task/DueLabel"
import { TaskTitle } from "@/components/task/TaskCheck"
import ResizeableTextInput from "@/components/resizeableTextInput/resizeableTextInput"
import TaskSubTaskAssignee from "@/components/task/taskSubTaskAssignee"
import type { UserProfileDataInterface } from "@/types/user"
import type { NewSubTaskDraft, TaskInfoInterface } from "@/types/task"

type SubtasksSectionProps = {
    isAdmin: boolean
    subtasks: TaskInfoInterface[]
    projectMembers: UserProfileDataInterface[]
    onToggleStatus: (task_uuid: string, newStatus: "done" | "todo") => void
    onRename: (task_uuid: string, name: string) => void
    onUpdateStart: (task_uuid: string, date?: Date) => void
    onUpdateDue: (task_uuid: string, date?: Date) => void
    onUpdateAssignee: (task_uuid: string, userInfo?: UserProfileDataInterface) => void
    onOpen: (task_uuid: string) => void
    onCreateSubtask: (subtaskData: NewSubTaskDraft) => void
}

const EMPTY_DRAFT: NewSubTaskDraft = { task_name: "", task_assignee_uuid: "", task_due_date: undefined, task_start_date: undefined, task_assignee: undefined }

/**
 * A task's subtasks (design v3, work.md W30): "Subtasks · 2 of 3" with a
 * 64 x 4 bar, then 30px rows with a 16px checkbox, the title, its due date,
 * and on hover the assignee and a way in. Ticking one springs its box and
 * strikes its title, with no sparks (eight bursts in a panel of subtasks
 * would be noise); ticking the last open one is the Ring tier, from the
 * bar's end. "+ Add subtask" becomes a field; Enter adds and keeps a field
 * for the next.
 */
export function SubtasksSection({ isAdmin, subtasks, projectMembers, onToggleStatus, onRename, onUpdateAssignee, onOpen, onCreateSubtask }: SubtasksSectionProps) {
    const [adding, setAdding] = useState(false)
    const [draft, setDraft] = useState("")
    const [draftKey, setDraftKey] = useState(0)
    const barEnd = useRef<HTMLSpanElement>(null)
    // The ones this person just ticked, for the spring and the strike.
    const [justDone, setJustDone] = useState<Set<string>>(() => new Set())

    const total = subtasks.length
    const done = subtasks.filter((s) => s.task_status === "done").length

    const toggle = useCallback(
        (task: TaskInfoInterface) => {
            const next = task.task_status === "done" ? "todo" : "done"
            if (next === "done") {
                if (!prefersReducedMotion()) setJustDone((prev) => new Set(prev).add(task.task_uuid))
                // The last open one: the bar fills and the Ring tier bursts from its end.
                const open = subtasks.filter((s) => s.task_status !== "done").length
                if (open === 1) celebrateRing(barEnd.current)
            }
            onToggleStatus(task.task_uuid, next)
        },
        [onToggleStatus, subtasks],
    )

    const add = () => {
        const name = draft.trim()
        if (!name) return
        onCreateSubtask({ ...EMPTY_DRAFT, task_name: name })
        setDraft("")
        // A fresh field, focused, for the next one.
        setDraftKey((k) => k + 1)
    }

    if (total === 0 && !isAdmin) return null

    return (
        <section className="mb-6" data-subtasks="">
            <div className="mb-1 flex h-7 items-center gap-2">
                <h3 className={panelSection}>Subtasks</h3>
                {total > 0 && (
                    <>
                        <span className="text-meta tabular-nums text-ink-3">
                            {done} of {total}
                        </span>
                        <span className="relative inline-flex w-16">
                            <Bar value={(done / total) * 100} size={4} label={`${done} of ${total} subtasks done`} />
                            <span ref={barEnd} aria-hidden className="absolute right-0 top-1/2 size-0" data-subtask-bar-end="" />
                        </span>
                    </>
                )}
            </div>

            <ul className="flex flex-col">
                {subtasks.map((subtask) => (
                    <SubtaskItem
                        key={subtask.task_uuid}
                        subtask={subtask}
                        isAdmin={isAdmin}
                        projectMembers={projectMembers}
                        justDone={justDone.has(subtask.task_uuid)}
                        onToggle={toggle}
                        onRename={onRename}
                        onUpdateAssignee={onUpdateAssignee}
                        onOpen={onOpen}
                    />
                ))}
            </ul>

            {isAdmin &&
                (adding ? (
                    <AddRow
                        key={draftKey}
                        value={draft}
                        onChange={setDraft}
                        onAdd={add}
                        onCancel={() => {
                            setAdding(false)
                            setDraft("")
                        }}
                    />
                ) : (
                    <button
                        type="button"
                        onClick={() => setAdding(true)}
                        className="-ml-1 flex h-[30px] w-full items-center gap-2 rounded-md px-1 text-sm text-ink-3 transition-colors hover:bg-hover hover:text-foreground"
                    >
                        <Plus className="size-4" aria-hidden />
                        Add subtask
                    </button>
                ))}
        </section>
    )
}

function AddRow({ value, onChange, onAdd, onCancel }: { value: string; onChange: (v: string) => void; onAdd: () => void; onCancel: () => void }) {
    const ref = useRef<HTMLInputElement>(null)
    useEffect(() => ref.current?.focus(), [])
    return (
        <div className="-ml-1 flex h-[30px] items-center gap-2 px-1">
            <span aria-hidden className="size-4 shrink-0 rounded-[5px] ring-[1.5px] ring-inset ring-line-3" />
            <input
                ref={ref}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={fieldKeyDown((e) => {
                    if (e.key === "Enter") {
                        e.preventDefault()
                        onAdd()
                    }
                    if (e.key === "Escape") {
                        e.preventDefault()
                        e.stopPropagation()
                        onCancel()
                    }
                })}
                onBlur={() => {
                    if (!value.trim()) onCancel()
                }}
                placeholder="Subtask name, then Enter"
                aria-label="New subtask"
                className="h-7 min-w-0 flex-1 rounded-md bg-transparent px-1 text-sm outline-none ring-brand/40 placeholder:text-ink-3 focus-visible:ring-1"
            />
        </div>
    )
}

type SubtaskItemProps = {
    subtask: TaskInfoInterface
    isAdmin: boolean
    projectMembers: UserProfileDataInterface[]
    justDone: boolean
    onToggle: (task: TaskInfoInterface) => void
    onRename: (task_uuid: string, name: string) => void
    onUpdateAssignee: (task_uuid: string, userInfo?: UserProfileDataInterface) => void
    onOpen: (task_uuid: string) => void
}

const SubtaskItem = React.memo(function SubtaskItem({ subtask, isAdmin, projectMembers, justDone, onToggle, onRename, onUpdateAssignee, onOpen }: SubtaskItemProps) {
    const isCompleted = subtask.task_status === "done"
    return (
        <li className="group/sub -ml-1 flex h-[30px] items-center gap-2 rounded-md px-1 transition-colors hover:bg-hover" data-subtask={subtask.task_uuid}>
            <SubtaskBox checked={isCompleted} spring={justDone && isCompleted} disabled={!isAdmin} name={subtask.task_name} onToggle={() => onToggle(subtask)} />
            <div className="min-w-0 flex-1 text-sm font-[450]">
                {isAdmin && !isCompleted ? (
                    <ResizeableTextInput
                        delay={500}
                        content={subtask.task_name}
                        textUpdate={(s: string) => onRename(subtask.task_uuid, s)}
                        textUpdateOnEnter={(s: string) => onRename(subtask.task_uuid, s)}
                        placeholder="Subtask name"
                        className="!min-h-0 !border-0 !bg-transparent !px-0 !py-0 !text-sm truncate !shadow-none"
                    />
                ) : (
                    <TaskTitle done={isCompleted} justDone={justDone} className="block">
                        {subtask.task_name}
                    </TaskTitle>
                )}
            </div>
            <DueLabel date={subtask.task_due_date} done={isCompleted} className="shrink-0" />
            {/* On hover: who has it (always, once someone does), and a way in. */}
            {isAdmin && (
                <span className={cn("flex shrink-0 items-center transition-opacity", !subtask.task_assignee && "opacity-0 pointer-events-none focus-within:opacity-100 focus-within:pointer-events-auto group-hover/sub:opacity-100 group-hover/sub:pointer-events-auto [@media(hover:none)]:opacity-100 [@media(hover:none)]:pointer-events-auto")}>
                    <TaskSubTaskAssignee taskProjectMembers={projectMembers} userProfile={subtask.task_assignee} assigneeUpdate={(u) => onUpdateAssignee(subtask.task_uuid, u)} />
                </span>
            )}
            <button
                type="button"
                onClick={() => onOpen(subtask.task_uuid)}
                aria-label={`Open ${subtask.task_name}`}
                className="inline-flex size-6 shrink-0 items-center justify-center rounded-sm text-ink-3 opacity-0 transition-opacity hover:bg-press hover:text-foreground focus-visible:opacity-100 group-hover/sub:opacity-100 [@media(hover:none)]:opacity-100"
            >
                <ArrowUpRight className="size-3.5" />
            </button>
        </li>
    )
})

/**
 * The subtask's 16px r5 checkbox (W30): an inset line-3 ring at rest; checked,
 * a moss fill with a white check that springs in on the click that ticked it.
 */
function SubtaskBox({ checked, spring, disabled, name, onToggle }: { checked: boolean; spring: boolean; disabled: boolean; name: string; onToggle: () => void }) {
    return (
        <button
            type="button"
            role="checkbox"
            aria-checked={checked}
            aria-label={checked ? `Mark ${name} as not done` : `Mark ${name} done`}
            disabled={disabled}
            onClick={(e) => {
                e.stopPropagation()
                onToggle()
            }}
            className={cn(
                "inline-flex size-4 shrink-0 items-center justify-center rounded-[5px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                checked ? "bg-camp-moss text-white" : "ring-[1.5px] ring-inset ring-line-3 hover:ring-camp-moss",
            )}
            style={spring ? { animation: "work-check-fill 220ms var(--ease-spring) both" } : undefined}
            data-anim={spring ? "fill" : undefined}
        >
            {checked && <Check className="size-3" />}
        </button>
    )
}
