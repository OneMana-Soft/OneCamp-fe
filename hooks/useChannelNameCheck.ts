"use client"

import { useEffect, useState } from "react"
import { useFetch } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import type { ChannelNameExistsInterface } from "@/types/channel"

/** How long typing has to stop before a name is asked about. */
const ASK_AFTER_MS = 450

/**
 * Whether a channel name is free, asked of the server (/ch/chNameIsAvailable)
 * a moment after typing stops: New channel's name and a rename in Details ask
 * the same way. `name` is the name to ask about, trimmed, or "" for one not
 * worth asking (empty, against the one name rule, or unchanged). `free` and
 * `taken` answer for `name` alone, never for one typed before it; `checking`
 * holds until its answer is in.
 */
export function useChannelNameCheck(name: string): { free: boolean; taken: boolean; checking: boolean } {
    const [asked, setAsked] = useState<string | null>(null)
    useEffect(() => {
        if (!name) {
            setAsked(null)
            return
        }
        const t = setTimeout(() => setAsked(name), ASK_AFTER_MS)
        return () => clearTimeout(t)
    }, [name])
    const { data, isLoading } = useFetch<ChannelNameExistsInterface>(
        asked ? `${GetEndpointUrl.CheckChannelNameAvailability}?ch_name=${encodeURIComponent(asked)}` : "",
    )
    const current = !!name && asked === name
    const answered = current && !!data
    return {
        free: answered && data.exists === false,
        taken: answered && data.exists === true,
        checking: !!name && (!current || isLoading),
    }
}
