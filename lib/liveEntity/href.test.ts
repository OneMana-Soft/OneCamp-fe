import { describe, expect, it } from "vitest"
import { entityOfHref } from "./href"

const APP = "https://app.example.com"

describe("entityOfHref: the one thing a OneCamp link names", () => {
  it("reads the app's pages of one thing, on its own origin or relative", () => {
    expect(entityOfHref(`${APP}/app/task/7d1e5c2a-0000-4000-8000-000000000001`, APP)).toEqual({ kind: "task", id: "7d1e5c2a-0000-4000-8000-000000000001" })
    expect(entityOfHref("/app/doc/d1", APP)).toEqual({ kind: "doc", id: "d1" })
    expect(entityOfHref(`${APP}/app/project/p1?tab=board#top`, APP)).toEqual({ kind: "project", id: "p1" })
    expect(entityOfHref(`${APP}/app/board/b1/`, APP)).toEqual({ kind: "board", id: "b1" })
    expect(entityOfHref(`  ${APP}/app/channel/c1  `, APP)).toEqual({ kind: "channel", id: "c1" })
  })

  it("names nothing for another site, another page, or a link that isn't one", () => {
    expect(entityOfHref("https://evil.example.org/app/task/t1", APP)).toBeNull()
    expect(entityOfHref("http://app.example.com/app/task/t1", APP)).toBeNull()
    expect(entityOfHref(`${APP}/app/project`, APP)).toBeNull()
    expect(entityOfHref(`${APP}/app/task/t1/comments`, APP)).toBeNull()
    expect(entityOfHref(`${APP}/app/settings/s1`, APP)).toBeNull()
    expect(entityOfHref(`${APP}/app/task/..%2Fadmin`, APP)).toBeNull()
    expect(entityOfHref("javascript:alert(1)", APP)).toBeNull()
    expect(entityOfHref("", APP)).toBeNull()
    expect(entityOfHref("/app/task/t1", "not an origin")).toBeNull()
  })
})
