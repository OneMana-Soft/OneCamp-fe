"use client"

import * as React from "react"
import { useFetch } from "@/hooks/useFetch"
import { useToast } from "@/hooks/use-toast"
import { followUrl, setFollow, type FollowMode, type FollowState } from "@/services/followService"

/**
 * How much the reader hears about a doc, and choosing it: one copy for the
 * More menu's submenu and the phone's sheet. state is undefined until it has
 * loaded, and stays so after an error (nothing to choose reads better than a
 * wrong choice).
 */
export function useFollowChoice(docId: string) {
    const { data, isError } = useFetch<{ msg: string; data: FollowState }>(followUrl(docId))
    const { toast } = useToast()
    const [saving, setSaving] = React.useState(false)
    const state = isError ? undefined : data?.data

    const choose = async (value: string) => {
        if (!state) return
        const mode = value as FollowMode
        if (mode === state.mode || saving) return
        setSaving(true)
        try {
            // Choosing the default again forgets the choice.
            await setFollow(docId, mode === state.default ? null : mode)
        } catch {
            toast({ title: "Couldn't change your notifications", description: "Try again in a moment.", variant: "destructive" })
        } finally {
            setSaving(false)
        }
    }

    return { state, saving, choose }
}
