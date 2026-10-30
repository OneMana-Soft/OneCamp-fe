import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle, type SheetDetent } from "./drawer"
import { SheetCancel, SheetGroup } from "./sheet-menu"
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

  // Design review, 22 Oct: at 60dvh a doc row's twelve items scrolled on every
  // phone. A menu grows to the shared maximum, as every sheet does.
  it("gives a menu no grabber, its content's height, at most 92dvh as every sheet", () => {
    render(<Sheet detent="menu" />)
    expect(document.querySelector("[data-v3-grabber]")).toBeNull()
    expect(sheet().className).toContain("max-h-[92dvh]")
    expect(sheet().className).not.toContain("max-h-[60dvh]")
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

  // On a phone a long list's last row ended inside the pinned footer's fade:
  // the body ran 12px under the footer, its end room with it (25 Oct 2026).
  it("keeps its end room in view over a pinned footer, under the footer's fade", () => {
    const css = readFileSync(join(ROOT, "app/phone.css"), "utf8")
    const coarse = css.slice(css.indexOf("@media (pointer: coarse) {\n    [data-sheet-body]"))
    expect(coarse).toMatch(/^@media \(pointer: coarse\) \{[^}]*\}\s*(\/\*[\s\S]*?\*\/\s*)?\[data-sheet-body\] \+ \[data-sheet-footer\] \{\s*margin-top: 12px;/)
  })

  it("says it holds a footer only when it has one: on a phone that footer is its foot (app/overlay.css 8b)", () => {
    render(<Sheet />)
    expect(sheet().hasAttribute("data-overlay-holds-footer")).toBe(false)
    cleanup()
    render(
      <Drawer open onOpenChange={() => {}}>
        <DrawerContent header={<DrawerTitle>Sheet</DrawerTitle>} footer={<button type="button">Save</button>}>
          <p>content</p>
        </DrawerContent>
      </Drawer>,
    )
    expect(sheet().hasAttribute("data-overlay-holds-footer")).toBe(true)
  })

  // Its rows scrolled up to 2px under the description, with no line between
  // (25 Oct 2026): the header is the overlay layout's, which draws a hairline
  // while the body says it has more above (app/overlay.css 4).
  it("says when its body has more above or below, under a header of the overlay layout's", () => {
    render(
      <Drawer open onOpenChange={() => {}}>
        <DrawerContent header={<DrawerTitle>Sheet</DrawerTitle>} footer={<button type="button">Save</button>}>
          <div style={{ height: 800 }} />
        </DrawerContent>
      </Drawer>,
    )
    const header = sheet().querySelector("[data-sheet-header]") as HTMLElement
    const body = sheet().querySelector("[data-sheet-body]") as HTMLElement
    expect(header.hasAttribute("data-overlay-header"), "the header isn't the overlay layout's").toBe(true)
    // What it holds keeps 8px over and under it, and a lone title stands centred in the 52px row.
    expect(header.className.split(/\s+/)).toEqual(expect.arrayContaining(["min-h-13", "py-2", "justify-center"]))
    // jsdom lays nothing out: the sizes a browser would give.
    Object.defineProperty(body, "clientHeight", { configurable: true, value: 300 })
    Object.defineProperty(body, "scrollHeight", { configurable: true, value: 800 })
    fireEvent.scroll(body)
    expect([body.hasAttribute("data-more-above"), body.hasAttribute("data-more-below")]).toEqual([false, true])
    body.scrollTop = 500
    fireEvent.scroll(body)
    expect([body.hasAttribute("data-more-above"), body.hasAttribute("data-more-below")]).toEqual([true, false])
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

  it("stacks every layer and its scrim on one level, each scrim over the layer under it, lighter", () => {
    // With the scrims a level under the layers, a confirm over a dialog, or a
    // sheet over one, left the dialog under it bright (DESIGN-BUILD-8).
    for (const f of ["components/ui/dialog.tsx", "components/ui/drawer.tsx", "components/ui/sheet.tsx"]) {
      const src = readFileSync(join(ROOT, f), "utf8")
      expect(src, f).toContain("z-[var(--z-modal)]")
      expect(src, f).not.toContain("--z-modal-backdrop")
    }
    // A confirm and its scrim share a level of their own, over the dialogs and
    // over the popover or menu that asked it (app/globals.css, the layers).
    const confirm = readFileSync(join(ROOT, "components/ui/alert-dialog.tsx"), "utf8")
    expect(confirm).not.toContain("--z-modal")
    expect(confirm.match(/z-\[var\(--z-confirm\)\]/g), "its scrim, its sheet and its dialog").toHaveLength(3)
    expect(readFileSync(join(ROOT, "app/globals.css"), "utf8")).not.toContain("--z-modal-backdrop")
    const css = readFileSync(join(ROOT, "app/phone.css"), "utf8")
    // Unlayered, so it outranks the scrim's own colour utility and the dialog's.
    const unlayered = css.replace(/@layer[^{]*\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\}/g, "")
    expect(unlayered).not.toContain("calc(var(--z-modal) +")
    expect(unlayered).toMatch(/:is\(\[data-vaul-drawer\], \.v3-dialog, \.v3-sheet\)\[data-state="open"\] ~ :is\(\[data-vaul-overlay\]\[data-v3-scrim\], \.v3-overlay\) \{\s*background-color: rgb\(10 11 14 \/ 0\.2\)/)
  })

  // A field's own sheet rose under Reschedule's popover and the composer's Send
  // later menu (z-popover, z-dropdown), which hid its title and the box to type
  // a date in. It and its scrim lie over the layer that asked for them, a rule
  // as specific as the sheet-over-a-sheet one, after it, so it wins in a menu
  // that is itself in a sheet. e2e/momentFields holds it in a browser.
  it("lays a field's own sheet, and its scrim, over the popover or menu that asked for it", () => {
    const css = readFileSync(join(ROOT, "app/phone.css"), "utf8")
    const unlayered = css.replace(/@layer[^{]*\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\}/g, "")
    const scrim = /\[data-radix-popper-content-wrapper\] ~ \[data-vaul-overlay\]\[data-v3-scrim\]\[data-state\] \{\s*z-index: calc\(var\(--z-dropdown\) \+ 1\)/
    const sheet = /\[data-radix-popper-content-wrapper\] ~ \[data-vaul-drawer\]\[data-v3-sheet\]\[data-state\] \{\s*z-index: calc\(var\(--z-dropdown\) \+ 2\)/
    expect(unlayered).toMatch(scrim)
    expect(unlayered).toMatch(sheet)
    expect(unlayered.search(sheet), "after the sheet-over-a-sheet rule").toBeGreaterThan(unlayered.search(/\[data-vaul-drawer\]\[data-state="open"\] ~ \[data-vaul-drawer\]\[data-v3-sheet\] \{/))
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
      // Its last control closes it: Cancel, or Done where its switches apply as
      // they're flipped and there is nothing to cancel (the calendar's, design review 22 Oct).
      expect(src, name).toMatch(/<SheetCancel( label="Done")? \/>/)
      const groups = src.split(/<SheetGroup\b/).slice(1)
      groups.forEach((g, i) => {
        const destroys = /\bdestructive\b|DrawerDestructiveActionLink/.test(g.split("</SheetGroup>")[0])
        if (destroys) expect(i, `${name}: a destructive row outside the last group`).toBe(groups.length - 1)
      })
    }
  })

  // On a short phone (375x667) the last group scrolled out of reach under a
  // menu's 60dvh cap: Move to trash could not be seen (DESIGN-BUILD-5, 22 Oct
  // 2026). The group that holds what destroys says so, from the rows it holds,
  // and app/phone.css keeps it at the sheet's foot while the rest scrolls. No
  // caller says it: the rows carry their tone already (DrawerItem).
  it("marks the group that holds what destroys, from its rows, and no other", () => {
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
    const [doc, del] = screen.getAllByRole("group")
    expect(doc.hasAttribute("data-holds-danger")).toBe(false)
    expect(del.hasAttribute("data-holds-danger")).toBe(true)
  })

  it("follows its rows: a group whose destructive row goes stops saying so", () => {
    const Menu = ({ danger }: { danger: boolean }) => (
      <Sheet detent="menu">
        <SheetGroup label="Rows">
          <DrawerItem label="Share" onClick={() => {}} />
          {danger && <DrawerItem label="Delete doc" onClick={() => {}} destructive />}
        </SheetGroup>
      </Sheet>
    )
    const { rerender } = render(<Menu danger />)
    expect(screen.getByRole("group").hasAttribute("data-holds-danger")).toBe(true)
    rerender(<Menu danger={false} />)
    expect(screen.getByRole("group").hasAttribute("data-holds-danger")).toBe(false)
  })

  it("keeps that group at a menu sheet's foot in app/phone.css, over the rows that scroll under it", () => {
    const css = readFileSync(join(ROOT, "app/phone.css"), "utf8")
    const at = css.indexOf('[data-v3-sheet][data-detent="menu"] .sheet-group[data-holds-danger]')
    expect(at, "the rule for a menu's destructive group").toBeGreaterThan(-1)
    const body = css.slice(at, css.indexOf("}", at))
    expect(body).toMatch(/position:\s*sticky/)
    expect(body).toMatch(/bottom:\s*\d+px/)
    // Opaque round it, so the rows going under it never show through.
    expect(body).toMatch(/box-shadow:[^;]*var\(--pop\)/)
  })
})

describe("while a sheet is open", () => {
  afterEach(() => document.documentElement.removeAttribute("data-sheet"))

  // B-2's sections sheet at 390: a toast came up over Add section, at the
  // sheet's foot (DESIGN-BUILD-5, 22 Oct 2026). app/phone.css C9 moves toasts
  // under the top bar while the keyboard is up; an open sheet owns the foot
  // too, so the sheet marks the page and C9 reads the mark (one place).
  it("marks the page, and unmarks it when the sheet goes", () => {
    const { unmount } = render(<Sheet detent="menu" />)
    expect(document.documentElement.getAttribute("data-sheet")).toBe("open")
    unmount()
    expect(document.documentElement.hasAttribute("data-sheet")).toBe(false)
  })

  it("keeps the mark while any sheet is open: a sheet over a sheet, then the one under it", () => {
    const Two = ({ top }: { top: boolean }) => (
      <>
        <Sheet detent="menu" />
        {top && <Sheet detent="half" />}
      </>
    )
    const { rerender, unmount } = render(<Two top />)
    expect(document.documentElement.getAttribute("data-sheet")).toBe("open")
    rerender(<Two top={false} />)
    expect(document.documentElement.getAttribute("data-sheet")).toBe("open")
    unmount()
    expect(document.documentElement.hasAttribute("data-sheet")).toBe(false)
  })

  it("drops the mark as soon as a sheet starts to close, before its slide ends", async () => {
    const Closing = ({ open }: { open: boolean }) => (
      <Drawer open={open} onOpenChange={() => {}}>
        <DrawerContent>
          <DrawerTitle>Sheet</DrawerTitle>
          <DrawerDescription>A sheet</DrawerDescription>
        </DrawerContent>
      </Drawer>
    )
    const { rerender } = render(<Closing open />)
    expect(document.documentElement.getAttribute("data-sheet")).toBe("open")
    rerender(<Closing open={false} />)
    await new Promise((r) => setTimeout(r, 0))
    expect(document.documentElement.hasAttribute("data-sheet")).toBe(false)
  })

  it("wraps a description's lines pretty, never leaving one word alone", () => {
    render(<Sheet />)
    expect(screen.getByText("A sheet").className.split(/\s+/)).toContain("text-pretty")
  })
})
