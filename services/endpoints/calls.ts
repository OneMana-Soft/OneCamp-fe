/**
 * The calls area's API endpoints: what only calls code uses (split from
 * services/endPoints.ts on 18 Oct 2026, platform P-SPEED). A route loads only its
 * own area's. An endpoint a second area comes to use moves to services/endPoints.ts
 * (app/endpointsShared.test.ts); scripts/endpoints/areas.mjs says which file is whose.
 */
/* eslint-disable @typescript-eslint/no-duplicate-enum-values */

export enum CallsGet {
    UserRecordingList = "/user/recordingList",
}

export enum CallsPost {
    SaveMyTranscript = "/livekit/my-transcript",
    ReportTranscriptionCapability = "/livekit/my-capability",
    AIInCallAskStream = "/ai/in-call/ask/stream",
}
