"use client"

import { useState } from "react"
import { Pencil } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DetailsRow as Row } from "@/components/channel/details/detailsParts"
import { useChannelNameCheck } from "@/hooks/useChannelNameCheck"
import { channelSlug, nameProblem } from "@/lib/validation/names"
import { isComposingKey } from "@/lib/keys/ime"

/**
 * The channel's name, first in Details › About (design v3 chat, C49), renamed
 * in place by its admins. Since the old Edit channel dialog went (183ce33d),
 * nothing in the app could rename a channel: Details saved the old name with
 * every change.
 *
 * A new name follows the one name rule (lib/validation/names, as creating a
 * channel does) and is checked a moment after typing stops against the names
 * in use (/ch/chNameIsAvailable); Save waits for both.
 */
export function ChannelNameRow({ name, canRename, onRename }: {
    name: string
    canRename: boolean
    /** Saves the new name; answers whether it was saved. */
    onRename: (next: string) => Promise<boolean>
}) {
    const [editing, setEditing] = useState(false)
    const [value, setValue] = useState(name)
    const [saving, setSaving] = useState(false)
    const next = value.trim()
    const changed = next !== name
    const problem = changed ? nameProblem("workspace", "Channel name", value) : ""

    // Asked as New channel asks, and only for a new name that could be one.
    const { taken, free } = useChannelNameCheck(editing && changed && !problem ? next : "")

    const start = () => {
        setValue(name)
        setEditing(true)
    }
    const cancel = () => {
        setEditing(false)
        setValue(name)
    }
    const submit = async () => {
        if (!changed) return cancel()
        if (problem || !free || saving) return
        setSaving(true)
        const ok = await onRename(next)
        setSaving(false)
        if (ok) setEditing(false)
    }

    if (!editing) {
        return (
            <Row label="Name" description={`#${name}`}>
                {canRename && (
                    <Button variant="ghost" size="icon-sm" aria-label="Rename channel" onClick={start}>
                        <Pencil />
                    </Button>
                )}
            </Row>
        )
    }

    const hint = problem || (taken ? `#${next} is taken. Try another name.` : free ? `#${next} is free.` : changed ? "Checking the name…" : "")
    return (
        <div className="space-y-2 px-3 py-3">
            <Label htmlFor="channel-name" className="text-meta font-medium text-ink-2">Name</Label>
            <Input
                id="channel-name"
                data-escape-own=""
                autoFocus
                value={value}
                maxLength={40}
                aria-invalid={!!problem || taken || undefined}
                aria-describedby="channel-name-hint"
                onChange={(e) => setValue(channelSlug(e.target.value))}
                onKeyDown={(e) => {
                    // An input method's Enter picks its word and its Escape drops it.
                    if (isComposingKey(e.nativeEvent)) return
                    if (e.key === "Enter") { e.preventDefault(); void submit() }
                    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cancel() }
                }}
            />
            <p id="channel-name-hint" aria-live="polite" className={problem || taken ? "text-meta text-danger-ink" : "text-meta text-ink-3"}>
                {hint}
            </p>
            <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={cancel}>Cancel</Button>
                <Button size="sm" onClick={() => void submit()} disabled={changed && (!!problem || !free || saving)}>
                    {saving ? "Saving…" : "Save"}
                </Button>
            </div>
        </div>
    )
}
