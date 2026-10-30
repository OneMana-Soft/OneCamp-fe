import { describe, expect, it } from "vitest"
import { joinTarget } from "./joinTarget"

// meet-01: a room's name or a link, typed where a meeting starts, as Meet's
// "Enter a code or link" and Zoom's "Join a meeting" take one.

const HERE = "https://acme.onemana.dev"

describe("joinTarget", () => {
  it("takes a room's name as its address is kept", () => {
    expect(joinTarget("maya-chen", HERE)).toEqual({ path: "/app/meet/join/r/maya-chen" })
    expect(joinTarget("  Maya Chen ", HERE)).toEqual({ path: "/app/meet/join/r/maya-chen" })
    expect(joinTarget("maya.chen", HERE)).toEqual({ path: "/app/meet/join/r/maya-chen" })
  })

  it("takes this app's room address and meeting link to the door that lets a member in as themselves", () => {
    expect(joinTarget(`${HERE}/r/maya-chen`, HERE)).toEqual({ path: "/app/meet/join/r/maya-chen" })
    expect(joinTarget("acme.onemana.dev/r/maya-chen/", HERE)).toEqual({ path: "/app/meet/join/r/maya-chen" })
    expect(joinTarget("/r/maya-chen", HERE)).toEqual({ path: "/app/meet/join/r/maya-chen" })
    expect(joinTarget(`${HERE}/guest/m/Tk_9-xQ`, HERE)).toEqual({ path: "/app/meet/join/Tk_9-xQ" })
  })

  it("keeps this app's own call pages as they are", () => {
    expect(joinTarget(`${HERE}/app/meet/m/5f1c2b?from=chat`, HERE)).toEqual({ path: "/app/meet/m/5f1c2b?from=chat" })
    expect(joinTarget(`${HERE}/app/meet/join/r/maya-chen`, HERE)).toEqual({ path: "/app/meet/join/r/maya-chen" })
  })

  it("opens a call somewhere else in a tab of its own", () => {
    expect(joinTarget("https://zoom.us/j/123456?pwd=x", HERE)).toEqual({ url: "https://zoom.us/j/123456?pwd=x" })
    expect(joinTarget("meet.google.com/abc-defg-hij", HERE)).toEqual({ url: "https://meet.google.com/abc-defg-hij" })
    expect(joinTarget("https://other.onemana.dev/r/maya-chen", HERE)).toEqual({ url: "https://other.onemana.dev/r/maya-chen" })
  })

  it("refuses what is neither a room's name nor a call", () => {
    for (const typed of ["", "   ", " -- ", "!!!", "javascript:alert(1)", "mailto:maya@acme.test", `${HERE}/app/settings`, `${HERE}/r/`, `${HERE}/r/Bad%20Room`, `${HERE}/guest/m/`]) {
      expect(joinTarget(typed, HERE), typed).toBeNull()
    }
  })
})
