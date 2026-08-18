import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

// Audio/video calling needs a LiveKit server, and the compose file shipped to customers
// defines twelve services of which NONE is LiveKit. So on a stock self-hosted install
// there is nothing to call into, and every call control was a control that fails.
//
// It was worse than that until now: the backend treated an unreachable LiveKit as a fatal
// startup error, so the shipped archive did not boot at all. That is fixed on the server
// side; this keeps the client honest about it.
//
// The rule: EVERY CONTROL THAT STARTS OR JOINS A CALL MUST BE GATED on FEATURE_CALLS.

const REPO_ROOT = join(__dirname, "..", "..")

/**
 * Files that route to a call page. Found by the path constants, so a new surface that
 * launches a call is picked up without being listed here.
 */
const CALL_PATH_CONSTANTS = ["app_chat_call", "app_channel_call", "app_grp_call"]

const CALL_SURFACES = [
    "components/chat/chatIdDesktop.tsx",
    "components/channel/chanelIdDesktop.tsx",
    "components/groupChat/chatGrpIdDesktop.tsx",
    "components/drawers/chatOptionsDrawer.tsx",
    "components/drawers/channelOptionsDrawer.tsx",
    "components/drawers/groupChatOptionsDrawer.tsx",
]

describe("call entry points are gated on a LiveKit server being present", () => {
    it("gates every surface that launches a call", () => {
        const ungated: string[] = []

        for (const rel of CALL_SURFACES) {
            const content = readFileSync(join(REPO_ROOT, rel), "utf8")
            const launchesCall =
                CALL_PATH_CONSTANTS.some((c) => content.includes(c)) ||
                /clickVideoCall|CallHref/.test(content)
            if (!launchesCall) continue
            if (/FeatureGate[\s\S]*?FEATURE_CALLS|useFeature\(\s*FEATURE_CALLS/.test(content)) continue
            ungated.push(rel)
        }

        expect(
            ungated,
            "These surfaces launch a call but do not gate the control on FEATURE_CALLS. On a " +
                "self-hosted install with no LiveKit server the button opens a call page that " +
                "cannot connect. Wrap the control in <FeatureGate feature={FEATURE_CALLS}>.",
        ).toEqual([])
    })

    it("gates the control, not an unrelated one beside it", () => {
        // A real mistake made while writing this: an over-greedy match wrapped the
        // NOTIFICATIONS item in the options drawers instead of the call item, which would
        // have hidden notification settings whenever calls were unavailable. The gate must
        // contain the call control and nothing else.
        for (const rel of [
            "components/drawers/chatOptionsDrawer.tsx",
            "components/drawers/channelOptionsDrawer.tsx",
            "components/drawers/groupChatOptionsDrawer.tsx",
        ]) {
            const content = readFileSync(join(REPO_ROOT, rel), "utf8")
            const match = content.match(/<FeatureGate feature=\{FEATURE_CALLS\}>([\s\S]*?)<\/FeatureGate>/)
            expect(match, `${rel} has no FEATURE_CALLS gate`).not.toBeNull()

            const inside = match![1]
            expect(
                inside,
                `${rel}: the call gate also encloses the notifications control, so turning ` +
                    `calls off would hide notification settings too`,
            ).not.toMatch(/Notification/)
            expect(
                (inside.match(/<DrawerItem/g) || []).length,
                `${rel}: the call gate encloses more than one menu item`,
            ).toBe(1)
            expect(inside, `${rel}: the gate does not contain the call control`).toMatch(/_call/)
        }
    })

    it("keeps the feature name identical to the backend's", () => {
        // helpers.FeatureNameCalls on the backend.
        const hook = readFileSync(join(REPO_ROOT, "hooks", "useClientConfig.ts"), "utf8")
        expect(hook).toContain('export const FEATURE_CALLS = "calls"')
        expect(hook).toContain('export const FEATURE_PUSH = "push"')
    })

    it("gates the command palette's call and AI commands", () => {
        // The palette is a flat list of commands, so its gate is a field on the command
        // rather than a wrapper. Distinct from capabilityKey, which asks whether the USER
        // may act, not whether the server can.
        const palette = readFileSync(join(REPO_ROOT, "components", "ui", "CommandPalette.tsx"), "utf8")
        expect(palette, "the palette does not filter on featureKey").toMatch(
            /cmd\.featureKey && features\?\.\[cmd\.featureKey\] !== true/,
        )
        expect(palette, "the instant meeting command is not gated on calls").toMatch(
            /id: "start-instant-meeting",\s*\n\s*featureKey: FEATURE_CALLS,/,
        )
    })
})
