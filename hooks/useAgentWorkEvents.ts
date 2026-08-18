"use client"

/**
 * useAgentWorkEvents — live agent-work updates, pushed.
 *
 * A durable agent job changes state a handful of times in its life: it starts,
 * someone may ask it to stop, it finishes. Polling for those moments means every
 * client watching a thread asks the API on a timer — wasteful on a desktop and
 * actively costly on a phone, since OneCamp installs as a PWA and a timer wakes
 * the device to re-read a list that usually hasn't changed.
 *
 * The backend now publishes each transition to the surface's own MQTT topic (the
 * channel, chat or project the work belongs to) and to the activity topic of
 * everyone involved. Clients are already subscribed to those topics from connect
 * time, so nothing new is subscribed here: this hook just listens for the DOM
 * event the MQTT handler re-broadcasts, optionally narrowed to one entity.
 *
 * Deliberately not a store slice: the consumers are the live-work surfaces, they
 * mount only when relevant, and putting transient run state in global state would
 * only add a place for it to go stale.
 */

import { useEffect, useRef } from "react"
import type { msgAgentWorkInterface } from "@/services/mqttService"

export const AGENT_WORK_EVENT = "agent-work-changed"

export interface UseAgentWorkEventsOptions {
    /**
     * When set, only events for this surface entity (channel post / chat message
     * / task uuid) are delivered. Omit to receive every event the client sees —
     * what the cross-surface "AI teammates" views want.
     */
    entityId?: string | null
    /** Called with each matching event. Kept in a ref, so it may be inline. */
    onChange: (work: msgAgentWorkInterface) => void
}

export function useAgentWorkEvents({ entityId, onChange }: UseAgentWorkEventsOptions): void {
    const onChangeRef = useRef(onChange)
    onChangeRef.current = onChange

    useEffect(() => {
        const handle = (e: Event) => {
            const work = (e as CustomEvent<msgAgentWorkInterface>).detail
            if (!work) return
            // A filtered listener ignores other surfaces. An event with no entity
            // (a job with nothing addressable) is only for the unfiltered views.
            if (entityId && work.entity_id !== entityId) return
            onChangeRef.current(work)
        }
        window.addEventListener(AGENT_WORK_EVENT, handle)
        return () => window.removeEventListener(AGENT_WORK_EVENT, handle)
    }, [entityId])
}

export default useAgentWorkEvents
