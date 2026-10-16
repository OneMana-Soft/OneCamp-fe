import { readdirSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { APP_SEGMENTS, isAppPlace } from "./appSegments"

const ROUTES_DIR = join(__dirname, "..", "..", "app", "app")

describe("the app's places", () => {
  it("are exactly the route folders under app/app", () => {
    const folders = readdirSync(ROUTES_DIR, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith("[") && !e.name.startsWith("("))
      .map((e) => e.name)
      .sort()
    expect([...APP_SEGMENTS].sort()).toEqual(folders)
  })

  it("tell a place from an address no route answers", () => {
    expect(isAppPlace("/app/channel/abc")).toBe(true)
    expect(isAppPlace("/app/myTask?x=1")).toBe(true)
    expect(isAppPlace("/app/this-page-wandered-off")).toBe(false)
    expect(isAppPlace("/app")).toBe(false)
    expect(isAppPlace("/blog/home")).toBe(false)
  })
})
