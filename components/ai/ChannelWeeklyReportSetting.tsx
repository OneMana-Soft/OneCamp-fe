"use client"

/**
 * ChannelWeeklyReportSetting — a channel's opt-in to the weekly channel report.
 *
 * The workspace switch used to be the only control, and turning it on posted a
 * report into EVERY active channel with no way to decline. That is why it was
 * never switched on. The workspace switch is now a ceiling and this is the
 * opt-in beneath it.
 *
 * Renders NOTHING when the workspace has the feature off. There is no action a
 * channel moderator could take in that state, and a disabled switch with an
 * explanation would only advertise a feature they cannot reach. Members who are
 * not moderators still see the state, read-only, because a weekly automated post
 * into their channel is something they should be able to find an answer for.
 *
 * Fails closed-quiet: any read error renders nothing rather than a misleading
 * "off", matching ChannelMemoryIndicator.
 */

import React, { useState } from "react"
import { useFetch } from "@/hooks/useFetch"
import { Switch } from "@/components/ui/switch"
import { CalendarClock } from "@/lib/icons"
import { withAI } from "@/components/common/withFeature"
import { DetailsRow } from "@/components/channel/details/detailsParts"
import { toast } from "@/hooks/use-toast"
import { apiErrorMessage } from "@/lib/utils/apiError"
import {
    channelWeeklyReportUrl,
    setChannelWeeklyReport,
    type ChannelWeeklyReportState,
} from "@/services/channelReportService"

interface Response {
    data?: ChannelWeeklyReportState
}

const ChannelWeeklyReportSettingUngated: React.FC<{ channelUUID: string }> = ({ channelUUID }) => {
    const { data, mutate } = useFetch<Response>(
        channelUUID ? channelWeeklyReportUrl(channelUUID) : "",
        undefined,
        { revalidateOnFocus: false, dedupingInterval: 60_000 },
        // A non-member read is refused by design, and that is not worth a global
        // error toast.
        { silent: true } as never,
    )
    const [saving, setSaving] = useState(false)

    const state = data?.data
    // The whole point of the gate: nothing to show when the workspace is off.
    if (!state?.org_enabled) return null

    const onToggle = async (next: boolean) => {
        setSaving(true)
        // Optimistic, then reconcile with what the server actually stored. A
        // refusal says what didn't happen: it said "Something went wrong" (QA F-35).
        await mutate(
            async () => {
                const saved = await setChannelWeeklyReport(channelUUID, next)
                return { data: saved ?? { ...state, enabled: next } }
            },
            {
                optimisticData: { data: { ...state, enabled: next } },
                rollbackOnError: true,
                revalidate: false,
            },
        ).catch((e) => {
            toast({
                title: next ? "Couldn't turn on the weekly report" : "Couldn't turn off the weekly report",
                description: apiErrorMessage(e, "Try again in a moment."),
                variant: "destructive",
            })
        })
        setSaving(false)
    }

    return (
        <DetailsRow
            icon={<CalendarClock className="h-4 w-4" />}
            label="Weekly channel report"
            description="Every Monday, post this channel's open decisions, commitments and questions."
        >
            <Switch
                checked={state.enabled}
                disabled={!state.can_manage || saving}
                onCheckedChange={onToggle}
                aria-label="Weekly channel report"
            />
        </DetailsRow>
    )
}

export const ChannelWeeklyReportSetting = withAI(ChannelWeeklyReportSettingUngated)
