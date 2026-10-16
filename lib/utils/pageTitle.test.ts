import { describe, expect, it } from "vitest"
import { pageTitle } from "@/lib/utils/pageTitle"

describe("pageTitle", () => {
  const lookups = { channels: { c1: "design" }, docs: { d1: "Launch sync notes" }, people: { u1: "Maya Chen" } }
  it("names the page from what the sidebar knows", () => {
    expect(pageTitle("/app/channel/c1", lookups)).toBe("#design · OneCamp")
    expect(pageTitle("/app/doc/d1?tab=history", lookups)).toBe("Launch sync notes · OneCamp")
    expect(pageTitle("/app/chat/u1", lookups)).toBe("Maya Chen · OneCamp")
    expect(pageTitle("/app/chat/group/g1", lookups)).toBe("Group chat · OneCamp")
  })
  it("names a page by the name it gave itself, which the sidebar can't know (PTC-38)", () => {
    expect(pageTitle("/app/task/t1", { own: "Book the launch retro" })).toBe("Book the launch retro · OneCamp")
    expect(pageTitle("/app/goals/g1", { own: "Reach 500 paying teams" })).toBe("Reach 500 paying teams · OneCamp")
    expect(pageTitle("/app/goals/g1")).toBe("Goals · OneCamp")
  })

  it("falls back to the section, and to the product", () => {
    expect(pageTitle("/app/channel/unknown", lookups)).toBe("Channels · OneCamp")
    expect(pageTitle("/app/myTask")).toBe("My tasks · OneCamp")
    expect(pageTitle("/app/something-new")).toBe("OneCamp")
  })
  // QA PTC-38: a table's tab read "Tables · OneCamp"; the table page names what it shows.
  it("names a table's tab by the table, and by its section until it is known", () => {
    expect(pageTitle("/app/tables/t1", { own: "Launch budget" })).toBe("Launch budget · OneCamp")
    expect(pageTitle("/app/tables/t1", { own: "  " })).toBe("Tables · OneCamp")
  })

  // QA SH-11 (14 Oct 2026): every settings page was "Settings · OneCamp", and
  // admin pages and the 404 just "OneCamp".
  it("names each settings and admin section, and a page that names itself", () => {
    expect(pageTitle("/app/settings/notifications")).toBe("Notifications · Settings · OneCamp")
    expect(pageTitle("/app/settings/profile")).toBe("Profile · Settings · OneCamp")
    expect(pageTitle("/app/settings")).toBe("Settings · OneCamp")
    expect(pageTitle("/app/admin", {}, 0, { tab: "users" })).toBe("Members · Settings · OneCamp")
    expect(pageTitle("/app/admin/evidence")).toMatch(/ · Settings · OneCamp$/)
    expect(pageTitle("/app/goals")).toBe("Goals · OneCamp")
    // CHAT-QA-FIX F-29: your posts and recordings name their tabs too.
    expect(pageTitle("/app/posts")).toBe("Your posts · OneCamp")
    expect(pageTitle("/app/recordings")).toBe("Recordings · OneCamp")
    expect(pageTitle("/app/no-such-page", {}, 2, { label: "Page not found" })).toBe("(2) Page not found · OneCamp")
  })

  it("counts what is waiting for you", () => {
    expect(pageTitle("/app/home", {}, 3)).toBe("(3) Home · OneCamp")
    expect(pageTitle("/app/home", {}, 250)).toBe("(99+) Home · OneCamp")
  })
})
