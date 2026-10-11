import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { describe, expect, it } from "vitest"

import { REDUCED_PAGE, browserAnimated, isTabRoot, pageFrames, routeMotion, titleFrames } from "./phoneTransition"
import { COMMIT_VELOCITY, EDGE_START_PX, finishMs, shouldCommit, wantsEdgeBack } from "./edgeBack"

// Design v3, mobile C4: push and pop on a phone, without ever holding a route.

const ROOT = join(__dirname, "..", "..", "..")

describe("which way a route change moves", () => {
  it("is sideways between the tabs' roots", () => {
    expect(isTabRoot("/app/home")).toBe(true)
    expect(isTabRoot("/app/inbox/")).toBe(true)
    expect(isTabRoot("/app/channel/abc")).toBe(false)
    expect(routeMotion("/app/home", "/app/channel", false)).toBe("tab")
    expect(routeMotion("/app/chat", "/app/inbox", true)).toBe("tab")
  })

  it("pushes going deeper and pops on history back or up a level", () => {
    expect(routeMotion("/app/channel", "/app/channel/abc", false)).toBe("push")
    expect(routeMotion("/app/home", "/app/task/t1", false)).toBe("push")
    expect(routeMotion("/app/channel/abc", "/app/channel", true)).toBe("pop")
    // The back arrow's replace to the parent, with no history behind it.
    expect(routeMotion("/app/channel/abc", "/app/channel", false)).toBe("pop")
    expect(routeMotion("/app/task/t1", "/app/myTask", false)).toBe("pop")
    expect(routeMotion("/app/home", "/app/home", false)).toBe("none")
  })
})

describe("the page's motion", () => {
  it("brings a pushed page 24px in from the right as it comes up from .4, 240ms", () => {
    const push = pageFrames("push")!
    expect(push.frames).toEqual([
      { transform: "translateX(24px)", opacity: 0.4 },
      { transform: "translateX(0)", opacity: 1 },
    ])
    expect(push.options.duration).toBe(240)
    expect(pageFrames("pop")!.frames[0]).toEqual({ transform: "translateX(-24px)", opacity: 0.4 })
  })

  it("only fades between tabs, 120ms, with no slide", () => {
    const tab = pageFrames("tab")!
    expect(tab.options.duration).toBe(120)
    for (const f of tab.frames) expect(f).not.toHaveProperty("transform")
    expect(pageFrames("none")).toBeNull()
  })

  it("moves the title in from 16px, and is a 120ms fade under reduced motion", () => {
    expect(titleFrames("push")!.frames[0]).toEqual({ transform: "translateX(16px)", opacity: 0 })
    expect(titleFrames("pop")!.frames[0]).toEqual({ transform: "translateX(-16px)", opacity: 0 })
    expect(REDUCED_PAGE.options.duration).toBe(120)
    for (const f of REDUCED_PAGE.frames) expect(Object.keys(f)).toEqual(["opacity"])
  })

  it("uses transform and opacity alone", () => {
    for (const m of ["push", "pop", "tab"] as const) {
      for (const f of [...pageFrames(m)!.frames, ...titleFrames(m)!.frames]) {
        for (const k of Object.keys(f)) expect(["transform", "opacity"]).toContain(k)
      }
    }
  })
})

describe("when the browser already animated", () => {
  it("trusts the Navigation API when it answers", () => {
    expect(browserAnimated(true, null, null)).toBe(true)
    expect(browserAnimated(false, 1000, 1100)).toBe(false)
  })

  it("otherwise reads a popstate within 400ms of an edge touch as Safari's own swipe", () => {
    expect(browserAnimated(undefined, 1000, 1200)).toBe(true)
    expect(browserAnimated(undefined, 1000, 1500)).toBe(false)
    expect(browserAnimated(undefined, null, 1200)).toBe(false)
  })
})

describe("the installed app's edge swipe back", () => {
  it("commits past half the width or on a flick above 500px/s", () => {
    expect(EDGE_START_PX).toBe(20)
    expect(COMMIT_VELOCITY).toBe(0.5)
    expect(shouldCommit(200, 390, 0)).toBe(true)
    expect(shouldCommit(190, 390, 0)).toBe(false)
    expect(shouldCommit(60, 390, 0.6)).toBe(true)
    expect(shouldCommit(60, 390, 0.4)).toBe(false)
    expect(shouldCommit(0, 390, 2)).toBe(false)
  })

  it("finishes what is left in max(160, 380 x remaining) ms, and springs back in 260", () => {
    expect(finishMs(0, 400, true)).toBe(380)
    expect(finishMs(200, 400, true)).toBe(190)
    expect(finishMs(380, 400, true)).toBe(160)
    expect(finishMs(100, 400, false)).toBe(260)
  })

  it("is for an installed app on iOS only (Android has predictive back)", () => {
    const win = (standalone: boolean, ua: string) =>
      ({
        matchMedia: (q: string) => ({ matches: standalone && q.includes("standalone") }),
        navigator: { userAgent: ua },
      }) as unknown as Window
    expect(wantsEdgeBack(win(true, "iPhone OS 18"))).toBe(true)
    expect(wantsEdgeBack(win(false, "iPhone OS 18"))).toBe(false)
    expect(wantsEdgeBack(win(true, "Linux; Android 15"))).toBe(false)
  })
})

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.tsx?$/.test(name) && !/\.test\./.test(name)) out.push(p)
  }
  return out
}

describe("never holding a route (the 9 Oct lesson)", () => {
  it("has no AnimatePresence and no exit animation under app/ or in the page transitions", () => {
    const files = [
      ...walk(join(ROOT, "app")),
      join(ROOT, "components/ui/PageTransition.tsx"),
      join(ROOT, "components/navigationBar/mobile/phoneTransition.ts"),
      join(ROOT, "components/navigationBar/mobile/mobileNavigationBar.tsx"),
    ]
    for (const f of files) {
      const src = readFileSync(f, "utf8")
      expect(src, relative(ROOT, f)).not.toMatch(/AnimatePresence/)
      expect(src, relative(ROOT, f)).not.toMatch(/\bexit=\{/)
    }
  })

  it("plays on the phone's scroller from the shell", () => {
    const shell = readFileSync(join(ROOT, "components/navigationBar/mobile/mobileNavigationBar.tsx"), "utf8")
    expect(shell).toMatch(/usePhoneTransition\(scrollerRef/)
    expect(shell).toMatch(/useEdgeBack\(scrollerRef/)
  })
})
