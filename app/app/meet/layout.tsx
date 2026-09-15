"use client"

import { FeatureRoute } from "@/components/common/withFeature"
import { FEATURE_CALLS } from "@/hooks/useClientConfig"
import { Video } from "@/lib/icons"

/**
 * One gate for every call route.
 *
 * Calling needs a LiveKit server, and the compose file a self-hosted customer
 * downloads does not include one, so an install without calls is the ordinary
 * case rather than the broken one. The call BUTTONS already know that. The call
 * ROUTES did not, and a route is reached by more than a button: a link pasted in
 * a channel, a bookmark, browser history, a guest invite forwarded to a member.
 *
 * Every one of those landed on the pre-join screen, asked for the camera, and
 * failed after the click with a toast blaming guest access. This says the true
 * thing before anything is asked for.
 *
 * It sits in the layout rather than in each of the four pages because the next
 * call route somebody adds should be covered by having been put here, not by
 * having remembered.
 */
export default function MeetLayout({ children }: { children: React.ReactNode }) {
    return (
        <FeatureRoute
            feature={FEATURE_CALLS}
            icon={Video}
            title="Calling is not set up on this server"
            description="Audio and video need a LiveKit server, which this workspace does not have running. An admin can add one, and the call buttons will come back on their own."
        >
            {children}
        </FeatureRoute>
    )
}
