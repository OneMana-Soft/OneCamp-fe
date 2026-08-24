import axiosInstance from "@/lib/axiosInstance"

// Per-channel opt-in for the weekly channel report.
//
// The workspace switch is the ceiling and this is the opt-in beneath it, so the
// response carries BOTH: a channel admin cannot turn the report on in a
// workspace that has the feature off, and the UI needs to know that in order to
// hide the control rather than offer a switch that would be refused.

export interface ChannelWeeklyReportState {
    // The workspace ceiling. False means hide the control entirely.
    org_enabled: boolean
    // This channel's own choice. Only meaningful while org_enabled is true.
    enabled: boolean
    // Whether THIS viewer may change it (channel moderators only).
    can_manage: boolean
}

// One definition of the path, because the reader's SWR cache key and the
// writer's target have to be the same string.
export const channelWeeklyReportUrl = (channelUUID: string) =>
    `/ch/${encodeURIComponent(channelUUID)}/weekly-report`

export async function setChannelWeeklyReport(
    channelUUID: string,
    enabled: boolean,
): Promise<ChannelWeeklyReportState | undefined> {
    const res = await axiosInstance.post(channelWeeklyReportUrl(channelUUID), { enabled })
    return (res.data as { data?: ChannelWeeklyReportState })?.data
}
