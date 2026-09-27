import { afterEach, describe, expect, it } from "vitest"
import { rememberPendingConnect, takePendingConnect } from "@/lib/pendingConnect"

describe("a sign-in waiting for login", () => {
  afterEach(() => sessionStorage.clear())

  it("comes back once", () => {
    rememberPendingConnect("3f2a4c1e-9b7d-4e2a-8c1f-0a1b2c3d4e5f")
    expect(takePendingConnect()).toBe("/connect/authorize?request=3f2a4c1e-9b7d-4e2a-8c1f-0a1b2c3d4e5f")
    expect(takePendingConnect()).toBeNull()
  })

  it("never becomes a redirect somewhere else", () => {
    rememberPendingConnect("https://evil.example")
    expect(takePendingConnect()).toBeNull()
    sessionStorage.setItem("oc.pendingConnect", "//evil.example")
    expect(takePendingConnect()).toBeNull()
  })
})
