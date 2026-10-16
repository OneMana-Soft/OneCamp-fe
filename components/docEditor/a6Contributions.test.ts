import { describe, expect, it } from "vitest"

import { slotFor } from "@/components/docEditor/registry/registry"
import "@/components/docEditor/follow/register"
import "@/components/docEditor/session/register"

// A6's contributions to the doc shell: "Notifications" in More, and the live
// meta events in the session slot, in every edition. The integrator adds the
// two register lines to the registry's index when A6 merges.
describe("A6's doc shell contributions", () => {
  it("register in the More and session slots, loading their components", async () => {
    const aiFree = { ai: false }
    const follow = slotFor("more", aiFree).find((c) => c.id === "follow")
    const meta = slotFor("session", aiFree).find((c) => c.id === "doc-meta-events")
    expect(follow?.edition).toBe("both")
    expect(meta?.edition).toBe("both")
    expect(typeof (await follow!.load!()).default).toBe("function")
    expect(typeof (await meta!.load!()).default).toBe("function")
    // Loading the menu's component is its first transform here: give it time.
  }, 60_000)
})
