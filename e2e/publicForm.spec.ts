import { expect, test, type Page, type TestInfo } from "@playwright/test"

import { lookPictures } from "./formLook"
import { stubBackend } from "./stubbedApp"
import { FORM_TOKEN, publicForm } from "./demoForm"

// The demo's form as a visitor answers it (package 9 R4), in a real browser
// on a production build: page by page, a bug opening its steps and taking a
// screenshot (R4b), what's missing said at its question, and the form's own
// thanks. Only the shown answers are sent, with the visitor's zone and the
// claim its files went under. On a computer and a phone, light and dark; with
// SHOTS_DIR set, each state is saved for review.

type Sent = { answers: Record<string, unknown>; website: string; tz: string; claim?: string }

/** A small screenshot a visitor adds: 48 by 32, a page with a bar and a button, so its thumbnail is a picture. */
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAADAAAAAgCAIAAADbtmxLAAAA3klEQVR42mNw63nm2f3Ep+uxf+ejoI4Hoe33I9vuxbTdjW+9ndRyK7X5ZmbT9ZzGa/kNV4sarpTWX6qsu1hTe6G+5nxT9dnWqjOdVad7Kk/2V5yYVH58atmxGaVH5pQenl9yaFHxgaVF+1cU7ltTsHd9/u5N+bu25u3ckbtjT862/dlbD2VtOZq56UTmxjMZG86nr7+UtvZq6pobKavvpKxiGHXQMHDQr19/qIVGHTTqoFEHDQ0HjRaMow4addCog0YdhNVBCioGtEajDhp10KiDBpeDRgvGUQcNVQcBAH4IbSXQBPsVAAAAAElFTkSuQmCC", "base64")
/** Its name is long enough to be cut in the middle at 390. */
const SHOT_NAME = "q4-launch-checkout-flow-screenshot-final.png"
const SHOT_ID = "e1111111-2222-4333-8444-555566667777"

async function openForm(page: Page, testInfo: TestInfo, theme: "light" | "dark", sent: Sent[], uploads: string[] = []) {
  await page.addInitScript((t) => localStorage.setItem("ui-theme", t), theme)
  await stubBackend(page, testInfo, {
    // A file as it is picked: the server keeps it under the page's claim.
    [`/public/form/${FORM_TOKEN}/file`]: (_url: URL, request: { postData(): string | null }) => {
      const body = request.postData() ?? ""
      const claim = /name="claim"\r\n\r\n([0-9a-f]{64})/.exec(body)?.[1] ?? ""
      uploads.push(claim)
      return { msg: "ok", data: { claim, file: { id: SHOT_ID, name: SHOT_NAME, size: PNG.length, mime: "image/png" } } }
    },
    [`/public/form/${FORM_TOKEN}`]: (_url: URL, request: { method(): string; postDataJSON(): unknown }) => {
      if (request.method() !== "POST") return { msg: "ok", data: publicForm }
      sent.push(request.postDataJSON() as Sent)
      return { msg: "Sent" }
    },
  })
  await page.goto(`/f/${FORM_TOKEN}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect(page.getByRole("heading", { name: "Launch requests" })).toBeVisible({ timeout: 60_000 })
}

async function shot(page: Page, name: string, theme: string) {
  const dir = process.env.SHOTS_DIR
  if (!dir) return
  await page.waitForTimeout(450)
  await page.screenshot({ path: `${dir}/${name}-${page.viewportSize()?.width}-${theme}.png`, fullPage: true })
}

async function atRest(page: Page) {
  await page.mouse.move(0, 0)
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
}

async function noSideScroll(page: Page) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(over).toBeLessThanOrEqual(0)
}

// Tables B5b: a sign-up whose link answers ahead and goes to the team's page once sent, and a form whose
// every question is hidden, so its link alone answers it.
type LinkedForm = { title: string; redirect?: string; fields: Record<string, unknown>[] }
const VENDOR: LinkedForm = {
  title: "Vendor sign-up",
  redirect: "https://example.test/thanks",
  fields: [
    // Tables B5c: its managers let a link hide these two (link_hides).
    { id: "name", label: "Company", type: "short_text", required: true, link_hides: true },
    { id: "tier", label: "Tier", type: "select", required: false, options: ["Gold", "Silver"], link_hides: true },
    { id: "src", label: "Source", type: "short_text", required: false, hidden: true },
  ],
}
// Tables B5c-2: a form that wears a cover and a logo (airtable-07's branding).
const LOOKED: LinkedForm = {
  title: "Vendor sign-up",
  fields: [{ id: "name", label: "Company", type: "short_text", required: false }],
}
// The same form, nothing marked: a link's hide_ hides nothing (main, 28 Oct).
const UNMARKED: LinkedForm = { ...VENDOR, fields: VENDOR.fields.map((f) => ({ ...f, link_hides: undefined })) }
// What a form says when its link answered every question and it has no intro (tables B5c).
const FILLED_BY_LINK = "This link has filled in your answers."
const UNSEEN: LinkedForm = {
  title: "Spring fair RSVP",
  fields: [
    { id: "src", label: "Source", type: "short_text", required: false, hidden: true },
    { id: "ref", label: "Referrer", type: "short_text", required: false, hidden: true },
  ],
}

async function openLinked(page: Page, testInfo: TestInfo, theme: "light" | "dark", sent: Sent[], form: LinkedForm, query: string) {
  const token = "b5b000000000000000000000"
  await page.addInitScript((t) => localStorage.setItem("ui-theme", t), theme)
  await stubBackend(page, testInfo, {
    [`/public/form/${token}`]: (_url: URL, request: { method(): string; postDataJSON(): unknown }) => {
      if (request.method() !== "POST") return { msg: "ok", data: { description: "", ...form } }
      sent.push(request.postDataJSON() as Sent)
      return { msg: "Sent" }
    },
  })
  await page.route("https://example.test/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<h1>Thanks from the team</h1>" }))
  await page.goto(`/f/${token}${query}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect(page.getByRole("heading", { name: form.title })).toBeVisible({ timeout: 60_000 })
}

for (const theme of ["light", "dark"] as const) {
  for (const [label, use] of [
    ["at 1280", { viewport: { width: 1280, height: 860 }, colorScheme: theme }],
    ["on a phone", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: theme }],
  ] as const) {
    test.describe(`a public form ${label}, ${theme}`, () => {
      test.use(use)

      // Tables B5c-2 (airtable-07's branding): the form's cover runs across the top of its sheet, edge to edge, and
      // its logo stands on the cover's foot over the title, on the page and on its thanks; both come from the server
      // by the paths the form gives.
      test("wears its cover and its logo, on the page and on the thanks", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        await page.goto("about:blank")
        const pics = await lookPictures(page)
        const token = "b5c200000000000000000000"
        await page.addInitScript((t) => localStorage.setItem("ui-theme", t), theme)
        await stubBackend(page, testInfo, {
          [`/public/form/${token}`]: (_url: URL, request: { method(): string }) =>
            request.method() !== "POST"
              ? { msg: "ok", data: { description: "Tell us about your company, and we'll be in touch within the week.", ...LOOKED, cover: `/public/form/${token}/cover`, logo: `/public/form/${token}/logo` } }
              : { msg: "Sent" },
        })
        await page.route(`**/public/form/${token}/cover`, (route) => route.fulfill({ status: 200, contentType: "image/png", body: pics.cover }))
        await page.route(`**/public/form/${token}/logo`, (route) => route.fulfill({ status: 200, contentType: "image/png", body: pics.logo }))
        await page.goto(`/f/${token}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
        const title = page.getByRole("heading", { name: LOOKED.title })
        await expect(title).toBeVisible({ timeout: 60_000 })
        const cover = page.locator("[data-form-sheet] [data-form-cover]")
        const logo = page.locator("[data-form-sheet] [data-form-logo]")
        await expect.poll(() => cover.evaluate((img: HTMLImageElement) => img.naturalWidth), { message: "the cover, drawn" }).toBe(1200)
        await expect.poll(() => logo.evaluate((img: HTMLImageElement) => img.naturalWidth), { message: "the logo, drawn" }).toBe(240)
        const sheet = (await page.locator("[data-form-sheet]").boundingBox())!
        const band = (await cover.boundingBox())!
        const mark = (await logo.boundingBox())!
        const heading = (await title.boundingBox())!
        expect([Math.round(band.x), Math.round(band.width), Math.round(band.y)], "the band, edge to edge across the sheet's top").toEqual([Math.round(sheet.x), Math.round(sheet.width), Math.round(sheet.y)])
        expect(mark.y, "the logo on the band's foot").toBeLessThan(band.y + band.height)
        expect(mark.y + mark.height, "above the title").toBeLessThanOrEqual(heading.y)
        await atRest(page)
        await noSideScroll(page)
        await shot(page, "public-look", theme)

        await page.getByLabel(/Company/).fill("Acme Stands")
        await page.getByRole("button", { name: "Send" }).click()
        await expect(page.locator("[data-form-sent] [data-form-cover]")).toBeVisible({ timeout: 15_000 })
        await expect(page.locator("[data-form-sent] [data-form-logo]")).toBeVisible()
        // The thanks card centres what it holds, and its band still runs edge to edge across its top (DB-27).
        const card = (await page.locator("[data-form-sent]").boundingBox())!
        const thanksBand = (await page.locator("[data-form-sent] [data-form-cover]").boundingBox())!
        expect([Math.round(thanksBand.x), Math.round(thanksBand.width), Math.round(thanksBand.y)], "the thanks band, edge to edge across the card's top").toEqual([
          Math.round(card.x),
          Math.round(card.width),
          Math.round(card.y),
        ])
        await atRest(page)
        await noSideScroll(page)
        await shot(page, "public-look-sent", theme)
      })

      test("goes page by page: a bug opens its steps, what's missing is said at its question, and it thanks in its own words", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        const sent: Sent[] = []
        await openForm(page, testInfo, theme, sent)
        await expect(page.getByText("Page 1 of 2")).toBeVisible()
        await expect(page.getByRole("button", { name: "Send" })).toHaveCount(0)
        // Next checks the page, and says what's missing at its question.
        await page.getByRole("button", { name: "Next" }).click()
        const what = page.getByLabel(/What do you need/)
        await expect(page.getByText("This needs an answer.")).toBeVisible()
        await expect(what).toBeFocused()
        await expect(what).toHaveAttribute("aria-invalid", "true")
        await atRest(page)
        await noSideScroll(page)
        await shot(page, "public-problem", theme)

        await what.fill("The sign-up button does nothing on Safari")
        await page.getByLabel(/Your email/).fill("joe@example.com")
        await page.getByRole("combobox", { name: /What kind of request is it/ }).click()
        await page.getByRole("option", { name: "A bug" }).click()
        const steps = page.getByLabel(/How do we see the bug/)
        await expect(steps).toBeVisible()
        await expect(page.getByText("The page, what you did, and what happened.")).toBeVisible()
        await steps.fill("Open /signup in Safari, fill it in and press Create account.")
        await page.getByRole("combobox", { name: /How soon do you need it/ }).click()
        await page.getByRole("option", { name: "This week" }).click()
        await atRest(page)
        await shot(page, "public-page1", theme)

        await page.getByRole("button", { name: "Next" }).click()
        await expect(page.getByText("Page 2 of 2")).toBeVisible()
        await expect(page.getByRole("heading", { name: "About you" })).toBeFocused()
        await expect(page.getByText("So we know who to follow up with.")).toBeVisible()
        await page.getByRole("combobox", { name: /Your team/ }).click()
        await page.getByRole("option", { name: "Support" }).click()
        await atRest(page)
        await noSideScroll(page)
        await shot(page, "public-page2", theme)

        // Back keeps what was written; the steps are still there for a bug.
        await page.getByRole("button", { name: "Back" }).click()
        await expect(page.getByLabel(/How do we see the bug/)).toHaveValue(/Open \/signup/)
        // Changed its mind: copy, not a bug. The steps go, and their answer is never sent.
        await page.getByRole("combobox", { name: /What kind of request is it/ }).click()
        await page.getByRole("option", { name: "Copy" }).click()
        await expect(page.getByLabel(/How do we see the bug/)).toHaveCount(0)
        await page.getByRole("button", { name: "Next" }).click()
        await page.getByRole("button", { name: "Send" }).click()
        await expect(page.getByRole("heading", { name: "Sent" })).toBeVisible()
        await expect(page.getByText("Thanks! It's on the launch team's board now, and we'll reply by email.")).toBeVisible()
        expect(sent).toHaveLength(1)
        expect(sent[0].answers).toEqual({
          what: "The sign-up button does nothing on Safari", email: "joe@example.com", kind: "Copy", soon: "This week", team: "Support",
        })
        expect(sent[0].tz).toBe(await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone))
        expect(sent[0].website).toBe("")
        await atRest(page)
        await noSideScroll(page)
        await shot(page, "public-sent", theme)
      })

      test("a bug brings its screenshot: sent as it is picked, shown with its size, and the form sent with its claim", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        const sent: Sent[] = []
        const uploads: string[] = []
        await openForm(page, testInfo, theme, sent, uploads)
        await page.getByLabel(/What do you need/).fill("Checkout crashes on Pay")
        await page.getByLabel(/Your email/).fill("joe@example.com")
        await page.getByRole("combobox", { name: /What kind of request is it/ }).click()
        await page.getByRole("option", { name: "A bug" }).click()
        await page.getByLabel(/How do we see the bug/).fill("Pay with a saved card.")
        const files = page.getByRole("group", { name: /A screenshot/ })
        await expect(files.getByText("Up to 5 files, 10 MB each")).toBeVisible()
        await atRest(page)
        await noSideScroll(page)
        await shot(page, "public-files-empty", theme)
        await files.locator("[data-form-file-input]").setInputFiles({ name: SHOT_NAME, mimeType: "image/png", buffer: PNG })
        const row = files.getByRole("listitem", { name: SHOT_NAME })
        // The picture shows itself, drawn by the browser.
        await expect(row.locator("[data-file-thumb] img")).toHaveJSProperty("naturalWidth", 48)
        await expect(row).toHaveAttribute("data-form-file", "kept")
        // Its size in the one form the app writes sizes (formatFileSizeForAttachment).
        await expect(row.getByText(`${PNG.length} bytes`)).toBeVisible()
        expect(uploads).toHaveLength(1)
        expect(uploads[0]).toMatch(/^[0-9a-f]{64}$/)
        await atRest(page)
        await noSideScroll(page)
        await shot(page, "public-files", theme)
        await page.getByRole("button", { name: "Next" }).click()
        await page.getByRole("button", { name: "Send" }).click()
        await expect(page.getByRole("heading", { name: "Sent" })).toBeVisible()
        expect(sent).toHaveLength(1)
        expect(sent[0].answers.shot).toEqual([SHOT_ID])
        expect(sent[0].claim).toBe(uploads[0])
      })

      // Tables B5b (airtable-07): the link answers ahead (prefill_), a hidden question is sent though
      // never drawn, and a form with a page of the team's goes there once it's sent.
      test("starts with its link's answers, sends a hidden one unseen, and goes to the team's page once sent", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        const sent: Sent[] = []
        await openLinked(page, testInfo, theme, sent, VENDOR, "?prefill_name=Acme&prefill_tier=silver&prefill_src=newsletter")
        await expect(page.getByRole("textbox", { name: /Company/ })).toHaveValue("Acme")
        await expect(page.getByText("Source")).toHaveCount(0)
        await atRest(page)
        await noSideScroll(page)
        await shot(page, "public-prefilled", theme)
        await page.getByRole("button", { name: "Send" }).click()
        await page.waitForURL("https://example.test/thanks", { timeout: 30_000 })
        await expect(page.getByRole("heading", { name: "Thanks from the team" })).toBeVisible()
        expect(sent).toHaveLength(1)
        expect(sent[0].answers).toEqual({ name: "Acme", tier: "Silver", src: "newsletter" })
      })

      test("with every question hidden, is its title and Send, and sends what its link gives", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        const sent: Sent[] = []
        await openLinked(page, testInfo, theme, sent, UNSEEN, "?prefill_src=newsletter&prefill_ref=spring")
        await expect(page.getByText(/Source|Referrer/)).toHaveCount(0)
        await expect(page.getByText(FILLED_BY_LINK)).toBeVisible()
        await expect(page.getByRole("button", { name: "Send" })).toBeVisible()
        await atRest(page)
        await noSideScroll(page)
        await shot(page, "public-all-hidden", theme)
        await page.getByRole("button", { name: "Send" }).click()
        await expect(page.getByRole("heading", { name: "Sent" })).toBeVisible()
        expect(sent).toHaveLength(1)
        expect(sent[0].answers).toEqual({ src: "newsletter", ref: "spring" })
      })

      // Tables B5c (Airtable's hide_): a link hides a shown question for its visit as it fills it, and a
      // required one it doesn't fill stays in sight, since nobody else could answer it.
      test("hides the shown questions its link fills and names in hide_, and sends their answers unseen", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        const sent: Sent[] = []
        await openLinked(page, testInfo, theme, sent, VENDOR, "?hide_company=true&prefill_name=Acme&hide_tier=1&prefill_tier=gold&prefill_src=fair")
        await expect(page.getByRole("button", { name: "Send" })).toBeVisible()
        await expect(page.getByText(/Company|Tier|Source/)).toHaveCount(0)
        await expect(page.getByText(FILLED_BY_LINK)).toBeVisible()
        await atRest(page)
        await noSideScroll(page)
        await shot(page, "public-link-hides", theme)
        await page.getByRole("button", { name: "Send" }).click()
        await page.waitForURL("https://example.test/thanks", { timeout: 30_000 })
        expect(sent).toHaveLength(1)
        expect(sent[0].answers).toEqual({ name: "Acme", tier: "Gold", src: "fair" })
      })

      test("keeps a required question in sight when its link hides it without its answer", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        const sent: Sent[] = []
        await openLinked(page, testInfo, theme, sent, VENDOR, "?hide_name=true&hide_tier=true&prefill_tier=silver")
        await expect(page.getByRole("textbox", { name: /Company/ })).toBeVisible()
        await expect(page.getByText("Tier")).toHaveCount(0)
        await expect(page.getByText(FILLED_BY_LINK)).toHaveCount(0)
        await atRest(page)
        await shot(page, "public-link-keeps-required", theme)
        await page.getByRole("textbox", { name: /Company/ }).fill("Brightline")
        await page.getByRole("button", { name: "Send" }).click()
        await page.waitForURL("https://example.test/thanks", { timeout: 30_000 })
        expect(sent[0].answers).toEqual({ name: "Brightline", tier: "Silver" })
      })

      test("hides nothing its managers didn't mark: the prefill stays in sight, to change", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        const sent: Sent[] = []
        await openLinked(page, testInfo, theme, sent, UNMARKED, "?hide_company=true&prefill_name=Acme&hide_tier=1&prefill_tier=gold")
        const company = page.getByRole("textbox", { name: /Company/ })
        await expect(company).toHaveValue("Acme")
        await expect(page.getByText("Tier", { exact: true }).first()).toBeVisible()
        await atRest(page)
        await shot(page, "public-link-unmarked", theme)
        await company.fill("Acme Ltd")
        await page.getByRole("button", { name: "Send" }).click()
        await page.waitForURL("https://example.test/thanks", { timeout: 30_000 })
        expect(sent[0].answers).toEqual({ name: "Acme Ltd", tier: "Gold" })
      })
    })
  }
}
