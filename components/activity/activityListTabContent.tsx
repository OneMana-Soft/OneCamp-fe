"use client"

import { useMemo } from "react"
import { ActivityMentionListResult } from "@/components/activity/activityMentionListResult"
import { ActivityCommentListResult } from "@/components/activity/activityCommentListResult"
import { ActivityReactionListResult } from "@/components/activity/activityReactionListResult"
import { ActivityAllListResult } from "@/components/activity/activityAllListResult"

export const ActivityListTabContent = ({ selectedTab }: { selectedTab: string }) => {
    const renderTab = useMemo(() => {
        switch (selectedTab) {
            case "all":
                return <ActivityAllListResult />
            case "mentions":
                return <ActivityMentionListResult />
            case "comments":
                return <ActivityCommentListResult />
            case "reactions":
                return <ActivityReactionListResult />
            default:
                return null
        }
    }, [selectedTab])

    return <div className="flex-1 min-h-0 overflow-hidden flex flex-col">{renderTab}</div>
}
