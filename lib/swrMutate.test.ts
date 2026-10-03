import { describe, expect, it, vi } from "vitest"
import { appMutate, bindAppMutate } from "./swrMutate"

// Code outside components (MQTT handlers, services) must revalidate the app's
// own cache, not SWR's default one, or live updates change nothing on screen.
describe("appMutate", () => {
  it("calls the mutate bound to the app's cache provider", async () => {
    const bound = vi.fn().mockResolvedValue(undefined)
    bindAppMutate(bound as never)
    await appMutate("/poll/abc")
    expect(bound).toHaveBeenCalledWith("/poll/abc")
    bindAppMutate(null)
  })
})
