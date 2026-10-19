import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle, SheetCancel, SheetGroup, type SheetDetent } from "./drawer"
import { DrawerItem } from "@/components/drawers/drawerItem"

// Design v3, mobile C5 and C7: one sheet for every drawer on the phone.

const ROOT = join(__dirname, "..", "..")

afterEach(() => {
  cleanup()
  document.querySelectorAll("[data-vaul-drawer-wrapper]").forEach((n) => n.remove())
  document.body.removeAttribute("style")
})

function Sheet({ detent, children }: { detent?: SheetDetent; children?: React.ReactNode }) {
  return (
    <Drawer open onOpenChange={() => {}} detent={detent}>
      <DrawerContent>
        <DrawerHeader className="sr-only">
          <DrawerTitle>Sheet</DrawerTitle>
          <DrawerDescription>A sheet</DrawerDescription>
        </DrawerHeader>
        {children ?? <p>content</p>}
      </DrawerContent>
    </Drawer>
  )
}

const sheet = () => document.querySelector("[data-vaul-drawer]") as HTMLElement

describe("the sheet's surface", () => {
  it("is the pop step at e4 with no border, marked for the r20 corners", () => {
    render(<Sheet />)
    const cls = sheet().className.split(/\s+/)
    expect(cls).toEqual(expect.arrayContaining(["bg-pop", "shadow-e4"]))
    expect(cls).not.toContain("border")
    expect(cls).not.toContain("bg-background")
    expect(sheet().hasAttribute("data-v3-sheet")).toBe(true)
    const css = readFileSync(join(ROOT, "app/phone.css"), "utf8")
    expect(css).toMatch(/--r-sheet:\s*20px/)
    expect(css).toMatch(/\[data-vaul-drawer\]\[data-v3-sheet\]\s*\{\s*border-top-left-radius: var\(--r-sheet\)/)
  })

  // The sheet takes focus to hold it inside. After a tap on a name in a
  // conversation, Chrome counted that focus as visible and outlined the
  // whole profile sheet in the accent: a surface draws no focus ring.
  it("draws no focus ring around itself", () => {
    render(<Sheet />)
    expect(sheet().className.split(/\s+/)).toContain("outline-none")
  })

  it("lays a 32% ink scrim, 55% black in dark", () => {
    render(<Sheet />)
    const scrim = document.querySelector("[data-vaul-overlay]") as HTMLElement
    expect(scrim.className).toContain("bg-[rgb(10_11_14/0.32)]")
    expect(scrim.className).toContain("dark:bg-[rgb(0_0_0/0.55)]")
  })

  it("rises in 420ms and goes in 300ms on the iOS curve", () => {
    const css = readFileSync(join(ROOT, "app/phone.css"), "utf8")
    expect(css).toMatch(/--t-sheet:\s*420ms/)
    expect(css).toMatch(/--t-sheet-out:\s*300ms/)
    expect(css).toMatch(/--ease-push:\s*cubic-bezier\(0\.32, 0\.72, 0, 1\)/)
  })
})

describe("detents", () => {
  it("gives a medium sheet the 36x5 grabber and a 92dvh cap", () => {
    render(<Sheet detent="medium" />)
    const grabber = document.querySelector("[data-v3-grabber]") as HTMLElement
    expect(grabber).not.toBeNull()
    expect(sheet().getAttribute("data-detent")).toBe("medium")
    expect(sheet().className).toContain("max-h-[92dvh]")
    const css = readFileSync(join(ROOT, "app/phone.css"), "utf8")
    expect(css).toMatch(/\[data-v3-grabber\]\s*\{\s*width: 36px;\s*height: 5px;/)
  })

  it("gives a menu no grabber, its content's height, at most 60dvh", () => {
    render(<Sheet detent="menu" />)
    expect(document.querySelector("[data-v3-grabber]")).toBeNull()
    expect(sheet().className).toContain("max-h-[60dvh]")
  })

  it("pushes the page back as a card under a large sheet only", () => {
    const wrapper = document.createElement("div")
    wrapper.setAttribute("data-vaul-drawer-wrapper", "")
    document.body.appendChild(wrapper)
    render(<Sheet detent="large" />)
    expect(sheet().className).toContain("h-[92dvh]")
    expect(wrapper.style.transform, "the page behind did not step back").toMatch(/scale\(/)
    // The body's style as written: jsdom's style.background still reads
    // "black" once vaul has taken the background away.
    const bodyStyle = () => document.body.getAttribute("style") ?? ""
    expect(bodyStyle()).toContain("background: black")
    // As the sheet goes, vaul gives the body its own background back at the end
    // of its 0.5 s close, on a timer: run here, in the test's own time. Left to
    // itself it outlived the file when the file's last tests were quick, and
    // fired with the environment gone: "document is not defined" (public
    // main's CI, under load).
    vi.useFakeTimers()
    try {
      cleanup()
      vi.advanceTimersByTime(500)
    } finally {
      vi.useRealTimers()
    }
    expect(bodyStyle(), "the page's own background, back after the close").not.toContain("background")
    wrapper.removeAttribute("style")
    render(<Sheet detent="medium" />)
    expect(wrapper.style.transform, "a medium sheet scaled the page").toBe("")
  })

  it("is declared by every phone drawer", () => {
    // The shell's viewport is the card the large sheets push back.
    const shell = readFileSync(join(ROOT, "components/navigationBar/mobile/mobileNavigationBar.tsx"), "utf8")
    expect(shell).toMatch(/data-app-viewport="" data-vaul-drawer-wrapper=""/)
    // Drawers an area wave had yet to move onto the primitive. Empty since the
    // integration (11 Oct): the chat's long-press sheets are its own
    // MessageActionSheet, and its options menu declares a detent. The list
    // only shrinks.
    const pending = new Set<string>([])
    const dir = join(ROOT, "components/drawers")
    const missing: string[] = []
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".tsx") && !f.includes(".test."))) {
      const src = readFileSync(join(dir, f), "utf8")
      const tags = src.match(/<Drawer\b[^>]*>/g) ?? []
      for (const tag of tags) if (!/\bdetent="(menu|medium|half|large)"/.test(tag) && !pending.has(f)) missing.push(f)
    }
    expect(missing, "pass detent=\"menu|medium|half|large\"").toEqual([])
  })
})

// The owner, 17 Oct 2026: "the user status drawer has both scroll bars", "the
// emoji picker drawer is expanding way too much". The browser half of these
// rules is e2e/phoneSheets.spec.ts.
describe("one scroller, up and down only", () => {
  it("is the body: it never scrolls sideways, and says it is the body", () => {
    render(<Sheet detent="medium" />)
    const body = sheet().querySelector("[data-sheet-body]") as HTMLElement
    expect(body, "no [data-sheet-body]").not.toBeNull()
    expect(body.className.split(/\s+/)).toEqual(expect.arrayContaining(["overflow-y-auto", "overflow-x-hidden", "overscroll-contain"]))
  })

  it("keeps room under the last row for a control's reach, and gives it back", () => {
    const css = readFileSync(join(ROOT, "app/phone.css"), "utf8")
    expect(css).toMatch(/@media \(pointer: coarse\) \{\s*\[data-sheet-body\] \{\s*padding-bottom: 12px;\s*margin-bottom: -12px;/)
  })

  // The owner, on a phone, 17 Oct: the status field "trimmed from left and
  // right", the sheet "smaller" after the keyboard went with the scroll bar
  // back, and Set status out of place. The browser half is
  // e2e/phoneSheets.spec.ts, through both kinds of keyboard.
  it("keeps a halo's room at the body's sides, and gives it back off its margins", () => {
    const css = readFileSync(join(ROOT, "app/phone.css"), "utf8")
    expect(css).toMatch(/\[data-sheet-body\] \{\s*padding-inline: 4px;\s*margin-inline: -4px;/)
  })

  it("pins its header over the scroller and its actions under it, never in it", () => {
    render(
      <Drawer open onOpenChange={() => {}}>
        <DrawerContent header={<DrawerTitle>Sheet</DrawerTitle>} footer={<button type="button">Save</button>}>
          <DrawerDescription>A sheet</DrawerDescription>
          <p>content</p>
        </DrawerContent>
      </Drawer>,
    )
    const header = sheet().querySelector("[data-sheet-header]") as HTMLElement
    const footer = sheet().querySelector("[data-sheet-footer]") as HTMLElement
    expect(header, "no header").not.toBeNull()
    expect(footer, "no footer").not.toBeNull()
    expect(header.closest("[data-sheet-body]"), "the title scrolls away with the content").toBeNull()
    expect(footer.closest("[data-sheet-body]"), "the actions scroll with the content").toBeNull()
    expect(header.nextElementSibling?.hasAttribute("data-sheet-body")).toBe(true)
    expect(footer.previousElementSibling?.hasAttribute("data-sheet-body")).toBe(true)
    // The v3 header row: 52px, its title centred (mobile C5).
    for (const c of ["shrink-0", "min-h-13", "text-center"]) expect(header.className).toContain(c)
    expect(footer.className).toContain("shrink-0")
  })

  // vaul's input repositioning wrote a height and a bottom on the sheet and
  // left them once the keyboard went (vaul #538, #650); the sheet stands on
  // the keyboard from lib/ui/visualViewport's measure instead, and only while
  // it is up.
  it("leaves the keyboard to app/phone.css, which writes nothing on the sheet", () => {
    const src = readFileSync(join(ROOT, "components/ui/drawer.tsx"), "utf8")
    expect(src).toMatch(/repositionInputs = false/)
    const css = readFileSync(join(ROOT, "app/phone.css"), "utf8")
    expect(css).toMatch(/html\[data-keyboard="open"\] \[data-vaul-drawer\]\[data-v3-sheet\] \{\s*bottom: calc\(100% - var\(--app-vv-top, 0px\) - var\(--app-vvh, 100%\)\);\s*max-height: calc\(var\(--app-vvh, 100dvh\) \* 0\.92\);\s*padding-bottom: 0;/)
    render(<Sheet detent="medium" />)
    expect(sheet().style.height).toBe("")
    expect(sheet().style.bottom).toBe("")
  })

  it("gives a picker the half detent: half the screen, never the large slab", () => {
    render(<Sheet detent="half" />)
    expect(sheet().getAttribute("data-detent")).toBe("half")
    expect(sheet().className).toContain("h-[max(50dvh,20rem)]")
    expect(sheet().className.split(/\s+/)).not.toContain("h-[92dvh]")
  })

  // A sheet's own padding, given on DrawerContent, took the place of its
  // home-indicator strip (tailwind-merge keeps the last pb), and sat outside
  // the body, where a small button's reach then ran past the scroller.
  it("takes a sheet's bottom space inside its content, never on DrawerContent", () => {
    const own: string[] = []
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.name === "node_modules" || e.name.startsWith(".")) continue
        const p = join(dir, e.name)
        if (e.isDirectory()) walk(p)
        else if (/\.tsx$/.test(e.name) && !/\.test\./.test(e.name)) {
          // Its own className: no nested markup (an `above` prop's) in between.
          for (const m of readFileSync(p, "utf8").matchAll(/<DrawerContent\b[^<>]*?\bclassName="([^"]*)"/g)) {
            if (/(^|\s)(p|py|pb)-/.test(m[1])) own.push(`${p.slice(ROOT.length + 1)}: ${m[1]}`)
          }
        }
      }
    }
    for (const d of ["app", "components"]) walk(join(ROOT, d))
    expect(own).toEqual([])
  })

  it("lays a top sheet's scrim, or a dialog's backdrop, over the sheet under it", () => {
    const css = readFileSync(join(ROOT, "app/phone.css"), "utf8")
    // Unlayered, so it outranks the scrim's own colour and z-index utilities.
    const unlayered = css.replace(/@layer[^{]*\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\}/g, "")
    expect(unlayered).toMatch(/\[data-vaul-drawer\]\[data-state="open"\] ~ \[data-vaul-overlay\]\[data-v3-scrim\] \{\s*z-index: calc\(var\(--z-modal\) \+ 1\)/)
    expect(unlayered).toMatch(/\[data-vaul-drawer\]\[data-state="open"\] ~ \[data-vaul-drawer\]\[data-v3-sheet\] \{\s*z-index: calc\(var\(--z-modal\) \+ 2\)/)
    expect(unlayered).toMatch(/\[data-vaul-drawer\]\[data-state="open"\] ~ \.v3-overlay \{\s*z-index: calc\(var\(--z-modal\) \+ 3\)/)
    expect(unlayered).toMatch(/\[data-vaul-drawer\]\[data-state="open"\] ~ \.v3-dialog \{\s*z-index: calc\(var\(--z-modal\) \+ 4\)/)
  })
})

describe("one sheet", () => {
  // The long-press message sheet drew vaul's scrim and sheet itself, so the
  // fix for a close Chrome never reports passed it by (REVIEW-FE-SHELL db2 F2).
  it("is drawn only by components/ui/drawer: nothing else imports vaul", () => {
    const own: string[] = []
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.name === "node_modules" || e.name.startsWith(".")) continue
        const p = join(dir, e.name)
        if (e.isDirectory()) walk(p)
        else if (/\.tsx?$/.test(e.name) && !/\.test\./.test(e.name) && /from "vaul"/.test(readFileSync(p, "utf8"))) own.push(p.slice(ROOT.length + 1))
      }
    }
    for (const d of ["app", "components", "hooks", "lib"]) walk(join(ROOT, d))
    expect(own).toEqual(["components/ui/drawer.tsx"])
  })
})

describe("an options menu (C7)", () => {
  it("is grouped cards with a Cancel card under them", () => {
    render(
      <Sheet detent="menu">
        <SheetGroup label="Doc">
          <DrawerItem label="Share" onClick={() => {}} />
        </SheetGroup>
        <SheetGroup label="Delete">
          <DrawerItem label="Delete doc" onClick={() => {}} destructive />
        </SheetGroup>
        <SheetCancel />
      </Sheet>,
    )
    const groups = screen.getAllByRole("group")
    expect(groups.map((g) => g.getAttribute("aria-label"))).toEqual(["Doc", "Delete"])
    expect(screen.getByRole("button", { name: "Cancel" }).hasAttribute("data-sheet-cancel")).toBe(true)
  })

  it("puts what destroys alone, in the last group, followed only by Cancel, in every options drawer", () => {
    const dir = join(ROOT, "components/drawers")
    const menus = ["calendarOptionsDrawer", "chatOptionsDrawer", "docOptionsDrawer", "groupChatOptionsDrawer", "myTaskOptionsDrawer", "teamOptionsDrawer", "taskDrawer", "projectLongPressDrawer", "channelOptionsDrawer"]
    for (const name of menus) {
      const src = readFileSync(join(dir, `${name}.tsx`), "utf8")
      expect(src, name).toMatch(/detent="menu"/)
      expect(src, name).toMatch(/<SheetGroup\b/)
      expect(src, name).toMatch(/<SheetCancel \/>/)
      const groups = src.split(/<SheetGroup\b/).slice(1)
      groups.forEach((g, i) => {
        const destroys = /\bdestructive\b|DrawerDestructiveActionLink/.test(g.split("</SheetGroup>")[0])
        if (destroys) expect(i, `${name}: a destructive row outside the last group`).toBe(groups.length - 1)
      })
    }
  })
})
