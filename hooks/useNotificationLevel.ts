"use client"

import { useEffect, useState } from "react"
import { usePost } from "@/hooks/usePost"
import { optimistic } from "@/lib/optimistic"
import { PostEndpointUrl } from "@/services/endPoints"
import { NotificationType } from "@/types/channel"
import type { ProjectNotificationInterface } from "@/types/project"

/**
 * Your notification level for something (all, mentions, nothing) and a choice
 * of it: shown at once, saved, and taken back if it's refused, through
 * lib/optimistic, so quick choices in a row end on the last one that wasn't
 * refused. `key` names the thing ("channel:<id>"): the level is read again
 * from `saved` (what the server last gave) when either changes. `save` makes
 * a choice and throws when it's refused, having said why (usePost);
 * `onSaved` runs once a choice is saved. The conversations' levels are in
 * hooks/useConversationNotification.
 */
export function useNotificationLevel(key: string, saved: string | undefined, save: (level: string) => Promise<unknown>, onSaved?: (level: string) => void) {
    const [level, setLevel] = useState<string>(saved || NotificationType.NotificationAll)
    useEffect(() => {
        if (saved) setLevel(saved)
    }, [key, saved])
    const choose = (next: string) => {
        const before = level
        void optimistic({
            key: `${key}:notify`,
            apply: () => setLevel(next),
            revert: () => setLevel(before),
            commit: () => save(next),
        }).then((r) => {
            if (r.ok) onSaved?.(next)
        })
    }
    return { level, choose }
}

/** A project's level, on a computer's header and in a phone's menu (PTC-26). */
export function useProjectNotification(projectId: string, saved: string | undefined) {
    const post = usePost()
    return useNotificationLevel(`project:${projectId}`, saved, (next) =>
        post.makeRequest<ProjectNotificationInterface>({ payload: { project_id: projectId, notification_type: next }, apiEndpoint: PostEndpointUrl.UpdateProjectNotification }),
    )
}
