import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

// One place, one name. Direct messages were "DMs" in the desktop nav, "Chats"
// on the phone's bottom bar, "Chat" in its title and "Messages" over the
// desktop pane. A heading or title that names the place says "Direct
// messages"; only a control too narrow for it (the desktop nav item, the
// phone's bar at 360px) says "DMs", and the bar still speaks the full name.
const ROOT = join(__dirname, "..", "..")
const src = (p: string) => readFileSync(join(ROOT, p), "utf8")

describe("the name of direct messages", () => {
  it("is the desktop pane's heading", () => {
    const s = src("app/app/chat/layout.tsx")
    expect(s).toMatch(/>Direct messages<\/h1>/)
    expect(s).not.toMatch(/>Messages<\/h1>/)
  })

  it("is the phone's title on the list", () => {
    const s = src("components/navigationBar/mobile/mobileTopNavigationBarSecond.tsx")
    expect(s).toMatch(/return "Direct messages";/)
    expect(s).not.toMatch(/return "Chat";/)
  })

  it("is spoken by the phone's bottom bar, which shows the short form", () => {
    const s = src("components/navigationBar/mobile/mobileBottomNavigationBar.tsx")
    expect(s).toMatch(/label: "DMs", name: "Direct messages"/)
    expect(s).not.toMatch(/label: "Chats"/)
    expect(s).toMatch(/aria-label=\{name \?\? label\}/)
  })

  it("heads the desktop sidebar's list, in sentence case", () => {
    expect(src("components/navigationBar/desktop/desktopNavigationBar.tsx")).toMatch(/title: 'direct messages'/)
    const side = src("components/navigationBar/desktop/desktopSideNavigationBar.tsx")
    expect(side).toMatch(/truncate first-letter:uppercase/)
  })
})
