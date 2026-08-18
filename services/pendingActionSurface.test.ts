import { describe, it, expect } from "vitest"
import {
    toPendingActionSurface,
    PENDING_ACTION_SURFACES,
    type PendingActionSurface,
} from "./pendingActionService"

/**
 * surface_type decides WHERE an approval card renders. Get it wrong and the card appears
 * nowhere: the in-thread tray filters on surface_id, and a value that is not a real surface
 * matches no tray and no fallback.
 *
 * That happened. Writes arriving over MCP stored a resource kind here — task, table,
 * self_owned — and the MQTT path defaulted to "", neither of which is a surface. Nothing
 * caught it because the value only matters at render time.
 */

describe("toPendingActionSurface — accepts the real surfaces", () => {
    it.each(PENDING_ACTION_SURFACES)("passes %s through unchanged", (surface) => {
        expect(toPendingActionSurface(surface)).toBe(surface)
    })

    it("covers exactly the backend's four surfaces", () => {
        // If the backend adds one, this fails and points at the omission rather than the new
        // surface silently becoming "assistant".
        expect([...PENDING_ACTION_SURFACES].sort()).toEqual(["assistant", "channel", "dm", "group"])
    })
})

describe("toPendingActionSurface — anything else becomes assistant", () => {
    it.each([
        ["the old empty-string default", ""],
        ["a resource kind leaking through", "task"],
        ["another resource kind", "self_owned"],
        ["a data source", "data_source"],
        ["wrong case", "Channel"],
        ["whitespace", "  dm  "],
        ["undefined", undefined],
        ["null", null],
        ["a number", 3],
        ["an object", { surface: "dm" }],
        ["an array", ["dm"]],
        ["a boolean", true],
    ])("%s -> assistant", (_label, input) => {
        expect(toPendingActionSurface(input)).toBe("assistant")
    })

    it("falls back to assistant rather than to the first member or an empty string", () => {
        // assistant means "not tied to a thread", so an unrecognised card lands in the home
        // attention list. Falling back to "channel" would address it to a thread that will
        // never match; falling back to "" matched nothing at all, which is how a card could
        // render nowhere.
        const result: PendingActionSurface = toPendingActionSurface("something-new")
        expect(result).toBe("assistant")
        expect(PENDING_ACTION_SURFACES).toContain(result)
    })

    it("always returns a member of the union, for any input", () => {
        const inputs: unknown[] = ["", "x", 0, false, null, undefined, NaN, [], {}, Symbol("s")]
        for (const input of inputs) {
            expect(PENDING_ACTION_SURFACES).toContain(toPendingActionSurface(input))
        }
    })

    it("does not throw on a hostile payload", () => {
        // This runs on an MQTT message, which is untrusted input on a hot path.
        const cyclic: Record<string, unknown> = {}
        cyclic.self = cyclic
        expect(() => toPendingActionSurface(cyclic)).not.toThrow()
    })
})
