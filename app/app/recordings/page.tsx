"use client"

import { useFetch } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import { playerUrls, refOfRecording } from "@/lib/calls/playerUrls"
import { CallsGet } from "@/services/endpoints/calls"
import type { UserProfileInterface } from "@/types/user"
import { RecordingsView } from "@/components/recording/RecordingsView"

/**
 * Every call recorded where you were, in a date range: the one recordings UI
 * (RecordingsView), over the workspace's list.
 */
export default function RecordingsPage() {
    const { data: selfProfile } = useFetch<UserProfileInterface>(GetEndpointUrl.SelfProfile)
    const self = selfProfile?.data.user_uuid

    return (
        <RecordingsView
            listUrl={CallsGet.UserRecordingList}
            playerUrls={(rec) => playerUrls(refOfRecording(rec), self)}
            subtitle="Calls recorded in your channels and conversations."
            currentUserId={self}
        />
    )
}
