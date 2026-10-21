import { expect, test } from "@playwright/test"

import { SAM } from "../stubbedApp"
import { CollabRelay } from "./collabRelay"
import { openDocWith } from "./docWith"

// A version's change marks are drawn whole (18 Oct 2026). Each block of the
// preview is laid out and painted only near the screen (content-visibility:
// auto, components/docEditor/history/history.css), which contains its paint:
// anything drawn outside a block's box is cut. A changed list item's bar sits
// 3 px outside its start, and the ring on the change the reader stepped to
// 5 px outside it, so in a list, an ordered list or a quote the ring showed
// as one edge, or two (dfc672a05, 13 Oct, born so). Measured in Chromium,
// Firefox and WebKit.

const DOC = "c4d2e6f8-1a3b-4c5d-9e7f-0a1b2c3d4e61"
const ago = (m: number) => new Date(Date.now() - m * 60_000).toISOString()
const V2 = { id: "v2", kind: "doc", pinned: false, reason: "interval", created_at: ago(12), contributors: [{ user_uuid: SAM.user_uuid }] }
const V1 = { id: "v1", kind: "doc", pinned: false, reason: "interval", created_at: ago(180), contributors: [{ user_uuid: SAM.user_uuid }] }
const version = (v: 1 | 2) =>
  [
    `<p data-block-id="a">We ship on ${v === 2 ? "Friday" : "Thursday"}</p>`,
    `<ul data-block-id="l"><li data-block-id="li1"><p data-block-id="p1">Book the room</p></li><li data-block-id="li2"><p data-block-id="p2">Send the invite${v === 2 ? " to Acme" : ""}</p></li></ul>`,
    `<ol data-block-id="o"><li data-block-id="oi1"><p data-block-id="op1">First${v === 2 ? " step" : ""}</p></li></ol>`,
    `<blockquote data-block-id="q"><p data-block-id="qp">${v === 2 ? "Ship it." : "Ship."}</p></blockquote>`,
    `<h2 data-block-id="h">Risks${v === 2 ? " and fixes" : ""}</h2>`,
  ].join("")

test("every change mark, and the ring on the change stepped to, is drawn whole", async ({ browser }, testInfo) => {
  test.setTimeout(150_000)
  const tab = await openDocWith(browser, testInfo, new CollabRelay(), SAM, { id: DOC }, {
    "/doc/versions/v2": { msg: "Success", data: { html: version(2) } },
    "/doc/versions/v1": { msg: "Success", data: { html: version(1) } },
    "/doc/versions": { msg: "Success", data: { versions: [V2, V1], people: { [SAM.user_uuid]: { name: "Sam Rivera" } } } },
  })
  const page = tab.page
  await page.getByRole("button", { name: "More doc actions" }).click()
  await page.getByRole("menuitem", { name: "Version history" }).click()
  const sheet = page.locator("[data-history-sheet]")
  const preview = sheet.locator(".history-preview")
  await expect(preview).toContainText("We ship on Friday")
  await sheet.getByRole("switch", { name: "Show changes" }).click()
  await expect(preview.locator("ins.history-ins").first()).toBeVisible()

  /** Marks that a box around them cuts: their outline or bar reaches past a box that clips its paint. */
  const cut = () =>
    preview.evaluate((root) => {
      const px = (v: string) => parseFloat(v) || 0
      const out: string[] = []
      for (const el of Array.from(root.querySelectorAll<HTMLElement>("[data-history-change], [data-history-current]"))) {
        const cs = getComputedStyle(el)
        const r = el.getBoundingClientRect()
        let [l, t, rt, b] = [r.left, r.top, r.right, r.bottom]
        if (cs.outlineStyle !== "none" && px(cs.outlineWidth) > 0) {
          const o = px(cs.outlineWidth) + px(cs.outlineOffset)
          ;[l, t, rt, b] = [l - o, t - o, rt + o, b + o]
        }
        const m = cs.boxShadow.match(/(-?[\d.]+)px (-?[\d.]+)px (-?[\d.]+)px (-?[\d.]+)px/)
        if (m && !/inset/.test(cs.boxShadow)) {
          const [x, y, blur, spread] = m.slice(1).map(Number)
          l = Math.min(l, r.left + x - blur - spread)
          rt = Math.max(rt, r.right + x + blur + spread)
          t = Math.min(t, r.top + y - blur - spread)
          b = Math.max(b, r.bottom + y + blur + spread)
        }
        for (let a = el.parentElement; a && a !== root.parentElement; a = a.parentElement) {
          const s = getComputedStyle(a)
          const clips = s.contentVisibility === "auto" || /paint|strict|content/.test(s.contain) || s.overflowX !== "visible" || s.overflowY !== "visible"
          if (!clips) continue
          const box = a.getBoundingClientRect()
          const sides = [l < box.left - 0.5 && "left", rt > box.right + 0.5 && "right", t < box.top - 0.5 && "top", b > box.bottom + 0.5 && "bottom"].filter(Boolean)
          if (sides.length) out.push(`"${(el.textContent ?? "").trim().slice(0, 24)}"${el.hasAttribute("data-history-current") ? " (stepped to)" : ""}: cut at its ${sides.join(", ")} by <${a.tagName.toLowerCase()}>`)
        }
      }
      return out
    })

  // Every change in turn, the ring on each.
  const stepper = sheet.locator("[data-change-stepper]")
  const next = sheet.getByRole("button", { name: "Next change" })
  await next.click()
  await expect(stepper).toContainText(/1 of \d+/)
  const total = Number(/of (\d+)/.exec((await stepper.textContent()) ?? "")![1])
  expect(total, "changes to step through").toBeGreaterThan(3)
  const found: string[] = []
  for (let i = 1; i <= total; i++) {
    await expect(stepper).toContainText(`${i} of ${total}`)
    await expect(preview.locator("[data-history-current]")).toHaveCount(1)
    for (const f of await cut()) if (!found.includes(f)) found.push(f)
    if (i < total) await next.click()
  }
  expect(found, "marks cut by a box around them").toEqual([])
  await tab.close()
})
