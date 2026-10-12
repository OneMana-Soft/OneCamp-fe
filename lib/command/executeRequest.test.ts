import { describe, expect, it } from "vitest"
import { executeRequest } from "@/lib/command/executeRequest"

/**
 * A slash command carries the people picked from the @ list. The text alone
 * says "@Maya Chen", and "/remind" reminded the person who set it because the
 * server couldn't tell who that was.
 */
describe("executeRequest", () => {
    const place = { channelId: "c1", threadTs: "t1" }

    it("carries the picked people and the text after the command", () => {
        const req = executeRequest("remind", "/remind @Maya Chen to review the deck tomorrow at 9am", place, "Asia/Kolkata", "trig", {
            "maya chen": "u-maya",
        })
        expect(req).toEqual({
            command: "remind",
            text: "@Maya Chen to review the deck tomorrow at 9am",
            channel_id: "c1",
            dm_group_id: undefined,
            thread_ts: "t1",
            timezone: "Asia/Kolkata",
            trigger_id: "trig",
            mentions: { "maya chen": "u-maya" },
        })
    })

    it("sends no mentions when nobody was picked", () => {
        expect(executeRequest("remind", "/remind me to stretch in 5 minutes", place, "UTC", "t", {}).mentions).toBeUndefined()
        expect(executeRequest("remind", "/remind me to stretch in 5 minutes", place, "UTC", "t").mentions).toBeUndefined()
    })
})
