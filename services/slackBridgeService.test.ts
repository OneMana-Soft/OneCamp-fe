import { describe, expect, it } from "vitest"
import { linkableChannels, slackChannelLabel, type SlackBridgeLink } from "./slackBridgeService"

const link = (channel_uuid: string): SlackBridgeLink => ({
    id: "l-" + channel_uuid,
    slack_channel_id: "C" + channel_uuid,
    slack_channel_name: "general",
    channel_uuid,
    channel_name: "general",
    created_at: "2026-10-01T00:00:00Z",
})

describe("linkableChannels", () => {
    it("leaves out channels already linked", () => {
        const channels = [{ ch_uuid: "a" }, { ch_uuid: "b" }, { ch_uuid: "c" }]
        expect(linkableChannels(channels, [link("b")]).map((c) => c.ch_uuid)).toEqual(["a", "c"])
    })
})

describe("slackChannelLabel", () => {
    it("says what a private channel needs before it can be linked", () => {
        expect(slackChannelLabel({ id: "C1", name: "eng", is_private: true, is_member: false })).toContain("/invite @OneCamp")
        expect(slackChannelLabel({ id: "C1", name: "eng", is_private: true, is_member: true })).toBe("#eng (private)")
        expect(slackChannelLabel({ id: "C2", name: "general", is_private: false, is_member: false })).toBe("#general")
    })
})
