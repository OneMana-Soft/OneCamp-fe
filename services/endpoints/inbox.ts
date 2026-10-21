/**
 * The inbox area's API endpoints: what only inbox code uses (split from
 * services/endPoints.ts on 18 Oct 2026, platform P-SPEED). A route loads only its
 * own area's. An endpoint a second area comes to use moves to services/endPoints.ts
 * (app/endpointsShared.test.ts); scripts/endpoints/areas.mjs says which file is whose.
 */
/* eslint-disable @typescript-eslint/no-duplicate-enum-values */

export enum InboxPost {
    // The Inbox marks the feed seen by asking; reading the feed marks nothing.
    MarkActivitySeen = "/activity/seen",
    // Email notification preferences (per-user).
    UpdateNotificationPreferences = "/user/notificationPreferences",
    AICatchUp = "/ai/catch-up",
}
