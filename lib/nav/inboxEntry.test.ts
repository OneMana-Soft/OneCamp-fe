import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { buildPrimaryNavLinks, inboxBadgeCount } from "@/lib/nav/primaryNavLinks"
import { FOLDED_NAV_TITLES } from "@/lib/nav/focusMode"
import { goTarget, GO_KEYS } from "@/lib/goKeys"
import { app_inbox_path, app_mail_path } from "@/types/paths"

// Design v3, shell N1 (the owner's decision): Inbox is where notifications
// and nudges live, the page that was Activity; the Gmail page is Mail. Old
// links redirect, the G keys follow, and the bell is retired.

const root = join(__dirname, "..", "..")
const read = (f: string) => readFileSync(join(root, f), "utf8")

describe("Inbox and Mail", () => {
  it("are /app/inbox (notifications) and /app/mail (Gmail)", () => {
    expect(app_inbox_path).toBe("/app/inbox")
    expect(app_mail_path).toBe("/app/mail")
    expect(read("app/app/inbox/page.tsx")).toMatch(/ActivityListTabs/)
    expect(read("app/app/mail/page.tsx")).toMatch(/InboxPage/)
  })

  it("redirect the old Activity link, and the Gmail connect callback, to their new homes", () => {
    const config = read("next.config.ts")
    expect(config).toMatch(/source: "\/app\/activity", destination: "\/app\/inbox", permanent: false/)
    expect(config).toMatch(/source: "\/app\/inbox",\s*has: \[\{ type: "query", key: "connector" \}\],\s*destination: "\/app\/mail"/)
  })

  it("open from G I, with G A kept as its alias, and Mail from G E", () => {
    expect(goTarget("i")).toBe("/app/inbox")
    expect(goTarget("a")).toBe("/app/inbox")
    expect(goTarget("e")).toBe("/app/mail")
    expect(GO_KEYS.map((g) => g.label)).not.toContain("Activity")
  })

  it("badges the sidebar's Inbox row with notifications and urgent nudges, never DMs", () => {
    expect(inboxBadgeCount({ activity: 2, urgentNudges: 1 })).toBe(3)
    const inbox = buildPrimaryNavLinks(["", "app", "home"], { channel: 4, dm: 9, activity: 0, urgentNudges: 0 }).find((l) => l.title === "Inbox")
    expect(inbox?.label).toBe("")
    // This edition has no AI, so nothing nudges.
    expect(read("components/navigationBar/desktop/desktopNavigationBar.tsx")).toMatch(/urgentNudges: 0/)
  })

  it("lists Mail behind More", () => {
    expect(FOLDED_NAV_TITLES).toContain("Mail")
  })

  it("is the phone tab bar's fourth tab", () => {
    expect(read("components/navigationBar/mobile/mobileBottomNavigationBar.tsx")).toMatch(/label: "Inbox", page: "app\/inbox"/)
  })

  it("has no AI nudges in Priority, in an edition without AI", () => {
    expect(read("components/activity/activityListTabs.tsx")).not.toMatch(/InboxNudges/)
  })
})
