import { beforeEach, describe, expect, it, vi } from "vitest"
import { followHistory, goBack, inAppDepth, noteRouteChange, parentPath, resetHistoryForTest } from "./back"

// Opened from a notification, an email or a fresh launch of the installed app,
// a page had nothing behind it in this app, and its back arrow (router.back)
// left the app or did nothing. Now the arrow goes back within the app while it
// can, and up to the page's parent when it cannot.

describe("parentPath", () => {
  it.each([
    ["/app/channel/c1/p1", "/app/channel/c1"],
    ["/app/channel/c1/recording", "/app/channel/c1"],
    ["/app/channel/c1", "/app/channel"],
    ["/app/chat/u1/m1", "/app/chat/u1"],
    ["/app/chat/u1", "/app/chat"],
    ["/app/chat/group/g1/m1", "/app/chat/group/g1"],
    ["/app/chat/group/g1", "/app/chat"],
    ["/app/doc/d1/comment", "/app/doc/d1"],
    ["/app/doc/d1", "/app/doc"],
    ["/app/task/t1", "/app/myTask"],
    ["/app/create/task", "/app/myTask"],
    ["/app/project/p1", "/app/project"],
    ["/app/team/t1", "/app/team"],
    ["/app/board/b1", "/app/board"],
    ["/app/tables/t1", "/app/tables"],
    ["/app/goals/g1", "/app/goals"],
    ["/app/calendar/event/e1", "/app/calendar"],
    ["/app/settings/agents", "/app/settings"],
    ["/app/ai/memory", "/app/ai"],
    ["/app/meet/ch/c1", "/app/channel/c1"],
    ["/app/meet/grp/g1", "/app/chat/group/g1"],
    ["/app/settings", "/app/home"],
    ["/app/templates", "/app/home"],
    ["/app/user/u1", "/app/home"],
    ["/app/channel", "/app/home"],
    ["/app/channel/c1?x=1#y", "/app/channel"],
  ])("%s goes up to %s", (from, to) => {
    expect(parentPath(from)).toBe(to)
  })
})

function fakeWindow() {
  const listeners: Array<() => void> = []
  const win = {
    history: { length: 1 } as History,
    addEventListener: (type: string, f: () => void) => {
      if (type === "popstate") listeners.push(f)
    },
  }
  return {
    win: win as unknown as Window,
    push: () => {
      ;(win.history as { length: number }).length++
      noteRouteChange(win as unknown as Window)
    },
    replace: () => noteRouteChange(win as unknown as Window),
    pop: () => {
      listeners.forEach((f) => f())
      noteRouteChange(win as unknown as Window)
    },
  }
}

beforeEach(() => resetHistoryForTest())

describe("the app's own history", () => {
  it("counts screens pushed, and screens gone back from", () => {
    const { win, push, pop } = fakeWindow()
    followHistory(win)
    noteRouteChange(win) // the landing page
    expect(inAppDepth()).toBe(0)
    push()
    push()
    expect(inAppDepth()).toBe(2)
    pop()
    expect(inAppDepth()).toBe(1)
    pop()
    pop() // never below none
    expect(inAppDepth()).toBe(0)
  })

  it("does not count a replace, such as a redirect", () => {
    const { win, replace } = fakeWindow()
    followHistory(win)
    noteRouteChange(win)
    replace()
    expect(inAppDepth()).toBe(0)
  })
})

describe("goBack", () => {
  it("goes up to the parent when the app has nothing behind the page", () => {
    const router = { back: vi.fn(), replace: vi.fn() }
    goBack(router, "/app/channel/c1/p1")
    expect(router.back).not.toHaveBeenCalled()
    expect(router.replace).toHaveBeenCalledWith("/app/channel/c1")
  })

  it("goes back when the previous screen is the app's", () => {
    const { win, push } = fakeWindow()
    followHistory(win)
    noteRouteChange(win)
    push()
    const router = { back: vi.fn(), replace: vi.fn() }
    goBack(router, "/app/task/t1")
    expect(router.back).toHaveBeenCalledTimes(1)
    expect(router.replace).not.toHaveBeenCalled()
  })
})
