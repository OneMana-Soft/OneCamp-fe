// The calls area's recordings slice (zoom-13): where a call's recording and its words are read, for a channel, a DM
// and a group chat (lib/calls/playerUrls, the recording embed). A slice of its own (services/endpoints/<area>.<slice>.ts,
// V-305), so the recording pages and the search row's player load these six, not the whole calls module.
export enum CallsRecordingGet {
    GetChannelRecordingMedia = "/ch/getRecordingURL",
    GetChatRecordingMedia = "/dm/getRecordingURL",
    GetGrpChatRecordingMedia = "/groupChat/getRecordingURL",
    GetChannelRecordingTranscript = "/ch/getRecordingTranscript",
    GetChatRecordingTranscript = "/dm/getRecordingTranscript",
    GetGrpChatRecordingTranscript = "/groupChat/getRecordingTranscript",
}
