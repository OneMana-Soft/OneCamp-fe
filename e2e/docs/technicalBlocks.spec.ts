import { expect, test, type Locator } from "@playwright/test"

import { SAM } from "../stubbedApp"
import { CollabRelay } from "./collabRelay"
import { PRIYA, openDocAs } from "./twoPeople"

// The doc's technical blocks in two browsers (docs programme B3): a simple
// table one person makes and fills is the other's too, an equation typed in
// one tab is drawn by KaTeX in the other, a code block's language reaches
// both (and its colours outlast the other's typing elsewhere), and Replace
// all changes every match for everyone, in one undo.
// The collaboration socket is answered in this process (collabRelay.ts).

test.describe.configure({ mode: "serial" })

const id = (n: number) => `7c1e5a3b-2d4f-4a6b-9c8d-0e1f2a3b4c${String(n).padStart(2, "0")}`

/** An element's text without the other person's caret, whose name label sits in the text. */
const textOf = (l: Locator) =>
  l.evaluate((el) => {
    const copy = el.cloneNode(true) as HTMLElement
    copy.querySelectorAll(".collaboration-cursor__caret").forEach((c) => c.remove())
    return copy.textContent
  })

test("a simple table one person makes and fills is the other's too", async ({ browser }, testInfo) => {
  const relay = new CollabRelay()
  const sam = await openDocAs(browser, testInfo, relay, SAM, { id: id(1) })
  const priya = await openDocAs(browser, testInfo, relay, PRIYA, { id: id(1) })

  await sam.body.click()
  await sam.page.keyboard.type("/simple")
  await expect(sam.page.locator("[data-slash-menu]")).toBeVisible()
  await sam.page.keyboard.press("Enter")
  await expect(sam.body.locator("table")).toBeVisible()
  // The caret is in the first header cell: Tab moves along the row.
  await sam.page.keyboard.type("Step")
  await sam.page.keyboard.press("Tab")
  await sam.page.keyboard.type("Owner")
  await expect.poll(() => textOf(priya.body.locator("th").nth(0)), { timeout: 15_000 }).toBe("Step")
  await expect.poll(() => textOf(priya.body.locator("th").nth(1))).toBe("Owner")
  await expect(priya.body.locator("tr")).toHaveCount(3)

  // + under the table adds a row, for both.
  await sam.body.locator("table").hover()
  await sam.page.locator(".doc-table-add-row").click()
  await expect(priya.body.locator("tr")).toHaveCount(4, { timeout: 15_000 })

  await sam.close()
  await priya.close()
})

test("an equation typed in one tab is drawn by KaTeX in the other", async ({ browser }, testInfo) => {
  const relay = new CollabRelay()
  const sam = await openDocAs(browser, testInfo, relay, SAM, { id: id(2) })
  const priya = await openDocAs(browser, testInfo, relay, PRIYA, { id: id(2) })

  await sam.body.click()
  await sam.page.keyboard.type("Energy is $E=mc^2$ here")
  const equation = priya.body.locator('[data-type="inline-math"]')
  await expect(equation).toHaveAttribute("title", "E=mc^2", { timeout: 15_000 })
  await expect(equation.locator(".katex")).toBeVisible({ timeout: 15_000 })
  // No ² and no typography in the TeX.
  await expect(sam.body).not.toContainText("²")

  await sam.close()
  await priya.close()
})

test("a code block's language reaches both, chosen from its list, and its colours outlast the other's typing", async ({ browser }, testInfo) => {
  const relay = new CollabRelay()
  const sam = await openDocAs(browser, testInfo, relay, SAM, { id: id(3) })
  const priya = await openDocAs(browser, testInfo, relay, PRIYA, { id: id(3) })

  await sam.body.click()
  await sam.page.keyboard.type("Intro")
  await sam.page.keyboard.press("Enter")
  await sam.page.keyboard.type("``` ")
  await sam.page.keyboard.type("fmt.Println(1)")
  await sam.body.locator(".doc-code").hover()
  await sam.page.locator("button.doc-code-lang").click()
  await sam.page.getByRole("textbox", { name: "Search languages" }).fill("golang")
  await sam.page.keyboard.press("Enter")
  await expect(sam.page.locator("button.doc-code-lang")).toContainText("Go")
  await expect(priya.body.locator("button.doc-code-lang")).toContainText("Go", { timeout: 15_000 })

  // Sam's typing elsewhere comes to Priya as the whole doc replaced; her code keeps its colours.
  const colours = priya.body.locator('.doc-code [class*="hljs-"]')
  await expect(colours.first()).toBeAttached({ timeout: 15_000 })
  await sam.body.locator("p", { hasText: "Intro" }).click()
  await sam.page.keyboard.press("End")
  await sam.page.keyboard.type(" and more")
  await expect(priya.body.locator("p", { hasText: "Intro and more" })).toBeVisible({ timeout: 15_000 })
  await expect(colours.first()).toBeAttached()

  await sam.close()
  await priya.close()
})

test("find counts the matches, and Replace all changes them for everyone in one undo", async ({ browser }, testInfo) => {
  const relay = new CollabRelay()
  const sam = await openDocAs(browser, testInfo, relay, SAM, { id: id(4) })
  const priya = await openDocAs(browser, testInfo, relay, PRIYA, { id: id(4) })

  await sam.body.click()
  await sam.page.keyboard.type("launch the launch plan")
  await sam.page.keyboard.press("Control+f")
  const find = sam.page.getByRole("search", { name: "Find in doc" })
  await expect(find).toBeVisible()
  await find.getByRole("textbox", { name: "Find" }).fill("launch")
  await expect(find).toContainText("1 of 2")
  await sam.page.keyboard.press("Control+Shift+h")
  await find.getByRole("textbox", { name: "Replace with" }).fill("ship")
  await sam.page.keyboard.press("Control+Enter")
  await expect.poll(() => textOf(priya.body), { timeout: 15_000 }).toContain("ship the ship plan")

  // One undo puts both back.
  await sam.page.keyboard.press("Escape")
  await sam.page.keyboard.press("Control+z")
  await expect.poll(() => textOf(priya.body), { timeout: 15_000 }).toContain("launch the launch plan")

  await sam.close()
  await priya.close()
})
