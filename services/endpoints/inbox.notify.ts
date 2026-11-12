// The Notification Router's answers about the session's own notices (A4 H3): a slice of the Inbox's endpoints
// (app/endpointsShared.test.ts), read only by their two doors, so services/endpoints/inbox.ts, which every page
// loads, stays as it was.
export enum NotifyPost {
    // Send me a test: one notice to the session's own devices, one a minute.
    Test = "/notify/test",
}

export enum NotifyGet {
    // Why am I seeing this?: the session's own record of one message, under /{message_id}.
    Why = "/notify/why",
}
