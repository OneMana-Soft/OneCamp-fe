"use client"

import * as React from "react"
import { History, RotateCcw, Trash2, Users } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { shortDate, shortDateTime } from "@/lib/utils/date/shortDate"
import {
    type AgentSkill,
    type SkillRevision,
    deleteAgentSkill,
    listAgentSkillRevisions,
    listAgentSkills,
    revertAgentSkill,
    updateAgentSkill,
} from "@/services/agentService"

/**
 * Editing the shared skill library.
 *
 * A skill is one instruction module attached to many agents, so an edit reaches
 * all of them on their next run. Until now it could be created and attached but
 * never EDITED and never REMOVED: the update and delete endpoints had no caller,
 * and neither did the history and revert built to make editing safe.
 *
 * The three things that make a shared edit safe are all on this screen, in the
 * order somebody needs them:
 *
 *   - who it affects, before the edit rather than after
 *   - why, recorded with the version
 *   - what it said before, and a way back
 */

interface Props {
    open: boolean
    onClose: () => void
    /** Called after a save or revert so the caller can refresh its own copy. */
    onChanged?: () => void
}

export function SkillLibraryDialog({ open, onClose, onChanged }: Props) {
    const { toast } = useToast()
    const [skills, setSkills] = React.useState<AgentSkill[]>([])
    const [selected, setSelected] = React.useState<AgentSkill | null>(null)
    const [name, setName] = React.useState("")
    const [instructions, setInstructions] = React.useState("")
    const [note, setNote] = React.useState("")
    const [revisions, setRevisions] = React.useState<SkillRevision[]>([])
    const [showHistory, setShowHistory] = React.useState(false)
    const [saving, setSaving] = React.useState(false)
    // Deleting a shared skill reaches every agent using it, so the button asks
    // once and says the number out loud before it does anything.
    const [confirmDelete, setConfirmDelete] = React.useState(false)
    // Failed reads, said as such: each used to leave its list empty, which said
    // "No skills yet." or "No history yet." about things that exist.
    const [loadFailed, setLoadFailed] = React.useState(false)
    const [historyFailed, setHistoryFailed] = React.useState(false)

    const load = React.useCallback(() => {
        void listAgentSkills()
            .then((next) => {
                setSkills(next)
                setLoadFailed(false)
            })
            .catch(() => setLoadFailed(true))
    }, [])

    React.useEffect(() => {
        if (open) load()
    }, [open, load])

    const select = (s: AgentSkill) => {
        setSelected(s)
        setName(s.name)
        setInstructions(s.instructions)
        // The reason belongs to one edit, so it never carries over to the next.
        setNote("")
        setShowHistory(false)
        setRevisions([])
        setConfirmDelete(false)
    }

    const dirty = !!selected && (name.trim() !== selected.name || instructions.trim() !== selected.instructions)

    const save = async () => {
        if (!selected || !dirty) return
        setSaving(true)
        try {
            await updateAgentSkill(selected.id, {
                name: name.trim(),
                instructions: instructions.trim(),
                note: note.trim(),
            })
            toast({
                title: "Skill saved",
                description: `${selected.agent_count} ${selected.agent_count === 1 ? "agent uses" : "agents use"} it from their next run.`,
            })
            setNote("")
            load()
            onChanged?.()
        } catch (e) {
            toast({ title: "Couldn't save the skill", description: apiErrorMessage(e, "Try again in a moment."), variant: "destructive" })
        } finally {
            setSaving(false)
        }
    }

    const remove = async () => {
        if (!selected) return
        setSaving(true)
        try {
            await deleteAgentSkill(selected.id)
            toast({
                title: "Skill deleted",
                description: selected.agent_count > 0
                    ? `${selected.agent_count} ${selected.agent_count === 1 ? "agent stops" : "agents stop"} using it from their next run.`
                    : "No agent was using it.",
            })
            setSelected(null)
            setConfirmDelete(false)
            load()
            onChanged?.()
        } catch (e) {
            toast({ title: "Couldn't delete the skill", description: apiErrorMessage(e, "Try again in a moment."), variant: "destructive" })
        } finally {
            setSaving(false)
        }
    }

    const openHistory = async () => {
        if (!selected) return
        setShowHistory(true)
        try {
            setRevisions(await listAgentSkillRevisions(selected.id))
            setHistoryFailed(false)
        } catch {
            setHistoryFailed(true)
        }
    }

    const revert = async (rev: SkillRevision) => {
        if (!selected) return
        setSaving(true)
        try {
            const updated = await revertAgentSkill(selected.id, rev.id)
            setName(updated.name)
            setInstructions(updated.instructions)
            toast({ title: "Earlier version restored", description: "It is live now, and the restore is in the history." })
            void openHistory()
            load()
            onChanged?.()
        } catch (e) {
            toast({ title: "Couldn't restore that version", description: apiErrorMessage(e, "Try again in a moment."), variant: "destructive" })
        } finally {
            setSaving(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-w-3xl">
                <DialogHeader>
                    <DialogTitle>Skill library</DialogTitle>
                    <DialogDescription>
                        Instructions shared across agents. Editing one changes every agent using it on its next run.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
                    <ul className="max-h-[420px] space-y-1 overflow-y-auto border-r border-border/50 pr-2">
                        {skills.map((s) => (
                            <li key={s.id}>
                                <button
                                    type="button"
                                    aria-current={selected?.id === s.id ? "true" : undefined}
                                    onClick={() => select(s)}
                                    className={`w-full rounded-md px-2 py-1.5 text-left text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 ${
                                        selected?.id === s.id ? "bg-primary/10 text-primary" : "hover:bg-highlight"
                                    }`}
                                >
                                    <span className="block truncate font-medium">{s.name}</span>
                                    <span className="text-2xs text-muted-foreground">
                                        {s.agent_count} agent{s.agent_count === 1 ? "" : "s"}
                                    </span>
                                </button>
                            </li>
                        ))}
                        {loadFailed && skills.length === 0 ? (
                            <li className="space-y-2 px-2 py-1.5">
                                <p role="alert" className="text-xs text-muted-foreground">Couldn&apos;t load the skills.</p>
                                <Button size="sm" variant="outline" className="h-8" onClick={load}>
                                    Try again
                                </Button>
                            </li>
                        ) : skills.length === 0 ? (
                            <li className="px-2 py-1.5 text-xs text-muted-foreground">No skills yet.</li>
                        ) : null}
                    </ul>

                    {!selected ? (
                        <p className="self-center text-xs text-muted-foreground">Pick a skill to edit it.</p>
                    ) : (
                        <div className="space-y-3">
                            {/* The blast radius, stated before the fields rather than after them. */}
                            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <Users className="h-3 w-3 shrink-0" aria-hidden="true" />
                                Used by {selected.agent_count} agent{selected.agent_count === 1 ? "" : "s"}. Saving changes
                                {selected.agent_count === 1 ? " it" : " all of them"} on the next run.
                            </p>

                            <div className="space-y-1.5">
                                <Label htmlFor="skill-name" className="text-xs">Name</Label>
                                <Input id="skill-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoComplete="off" />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="skill-instructions" className="text-xs">Instructions</Label>
                                <Textarea
                                    id="skill-instructions"
                                    value={instructions}
                                    onChange={(e) => setInstructions(e.target.value)}
                                    rows={7}
                                    className="text-xs"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="skill-note" className="text-xs">Why (optional)</Label>
                                <Input
                                    id="skill-note"
                                    value={note}
                                    onChange={(e) => setNote(e.target.value)}
                                    maxLength={500}
                                    autoComplete="off"
                                    placeholder="Kept with this version: stopped it repeating the channel name…"
                                />
                            </div>

                            <div className="flex items-center gap-2">
                                <Button size="sm" onClick={save} disabled={!dirty || saving}>
                                    Save
                                </Button>
                                <Button size="sm" variant="ghost" onClick={openHistory} disabled={saving}>
                                    <History className="mr-1.5 h-3.5 w-3.5" />
                                    History
                                </Button>
                                {/* Asks once, and the question carries the count rather than the
                                    generic "are you sure" that teaches people to click through. */}
                                {confirmDelete ? (
                                    <div className="ml-auto flex items-center gap-2">
                                        <span className="text-xs text-muted-foreground">
                                            {selected.agent_count > 0
                                                ? `Remove it from ${selected.agent_count} agent${selected.agent_count === 1 ? "" : "s"}?`
                                                : "Delete this skill?"}
                                        </span>
                                        <Button size="sm" variant="destructive" onClick={remove} disabled={saving}>
                                            Delete
                                        </Button>
                                        <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)} disabled={saving}>
                                            Cancel
                                        </Button>
                                    </div>
                                ) : (
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        className="ml-auto text-danger-ink hover:text-danger-ink"
                                        onClick={() => setConfirmDelete(true)}
                                        disabled={saving}
                                    >
                                        <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                                        Delete
                                    </Button>
                                )}
                            </div>

                            {showHistory && (
                                <ul className="max-h-52 space-y-2 overflow-y-auto border-t border-border/50 pt-2">
                                    {historyFailed && revisions.length === 0 && (
                                        <li className="flex flex-wrap items-center gap-2">
                                            <p role="alert" className="text-xs text-muted-foreground">Couldn&apos;t load the history.</p>
                                            <Button size="sm" variant="outline" className="h-8" onClick={() => void openHistory()}>
                                                Try again
                                            </Button>
                                        </li>
                                    )}
                                    {revisions.map((r, i) => (
                                        <li key={r.id} className="flex items-start gap-2">
                                            <div className="min-w-0 flex-1">
                                                <p className="text-xs text-muted-foreground">
                                                    {shortDateTime(new Date(r.created_at))}
                                                    {r.edited_by_name ? ` · ${r.edited_by_name}` : ""}
                                                    {r.note ? ` · ${r.note}` : ""}
                                                </p>
                                                <p className="truncate text-2xs text-foreground/80">{r.instructions}</p>
                                            </div>
                                            {/* The newest revision IS the current text, so there is nothing to
                                                go back to. Offering it would be a button that does nothing. */}
                                            {i > 0 && (
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() => revert(r)}
                                                    disabled={saving}
                                                    title="Restore this version"
                                                    aria-label={`Restore the version from ${shortDate(new Date(r.created_at))}`}
                                                >
                                                    <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                                                </Button>
                                            )}
                                        </li>
                                    ))}
                                    {!historyFailed && revisions.length === 0 && (
                                        <li className="text-xs text-muted-foreground">No history yet.</li>
                                    )}
                                </ul>
                            )}
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}
