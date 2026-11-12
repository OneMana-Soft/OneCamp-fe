import { expect, test, type Page, type Request, type TestInfo } from "@playwright/test"

import { SHOT_THEMES, reviewShot, stubBackend, withStatus } from "./stubbedApp"
import { overlapping, reachesIn } from "./touchReach"

// A fresh install's first admin, in a real browser with no backend (SHELL-02).
// A new server can't send email until an admin adds a key, and the first run's
// last step used to say "Each gets an email with a link to join", send, and
// open OneCamp: the people invited waited for emails that never came, and the
// links were nowhere. Now the step says up front that it makes links, and
// stays with each person's link, and all of them at once, until the admin
// opens OneCamp. With SHOTS_DIR=<dir> the step is saved at 1280 and 390,
// light and dark.

const LINK = (email: string) => `https://camp.example.com/signup?token=${encodeURIComponent(email)}`

// One address the server refuses, long enough to wrap on a phone.
const MEMBER = "priya.venkataraman-iyer@kestrel-studio.example"
const ALREADY = `${MEMBER} is already a member of this workspace.`

async function freshInstall(page: Page, testInfo: TestInfo, { email, answer }: { email: boolean; answer?: (to: string) => unknown }) {
  const invited: string[] = []
  await stubBackend(page, testInfo, {
    "/auth/admin-setup-required": { required: true, pinned: false },
    "/auth/admin-setup": { msg: "Admin account created" },
    "/auth/providers": { status: "success", providers: { email: true }, email_configured: email, workspace_name: "" },
    "/admin/addInvitation": (_url: URL, request: Request) => {
      const to = (request.postDataJSON() as { email: string }).email
      invited.push(to)
      if (answer) return answer(to)
      return email
        ? { invite_link: LINK(to), email_sent: true, email_error: "" }
        : { invite_link: LINK(to), email_sent: false, email_error: "email isn't set up on this server" }
    },
  })
  await page.goto("/admin-setup", { waitUntil: "domcontentloaded", timeout: 120_000 })
  await page.getByLabel("Your email").fill("ada@camp.example.com")
  await page.getByLabel("Password", { exact: true }).fill("correct horse battery")
  await page.getByLabel("Type it again").fill("correct horse battery")
  await page.getByRole("button", { name: "Create admin account" }).click()
  await page.getByRole("button", { name: "Continue" }).click({ timeout: 30_000 })
  await expect(page.getByRole("heading", { name: "Who's coming?" })).toBeVisible()
  return invited
}

for (const theme of SHOT_THEMES) {
  for (const [label, use] of [
    ["at 1280", { viewport: { width: 1280, height: 860 }, colorScheme: theme }],
    ["on a phone", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: theme }],
  ] as const) {
    test.describe(`the first run's invitations, ${label}, ${theme}`, () => {
      test.use({ ...use, permissions: ["clipboard-read", "clipboard-write"] })

      test("a fresh admin with email off gets copyable links", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        await page.addInitScript((t) => localStorage.setItem("ui-theme", t), theme)
        const invited = await freshInstall(page, testInfo, { email: false })

        // Before anything is sent: links, not emails.
        const lead = page.locator("[data-first-run-lead]")
        await expect(lead).toContainText("This server can't send email yet, so you'll get a link to share with each person yourself.")
        await expect(lead).not.toContainText("gets an email")
        await page.getByLabel("Email addresses").fill("ana@example.com, ben@example.com, cy@example.com ")
        await reviewShot(page, "first-run-invites-email-off", theme)
        await page.getByRole("button", { name: "Create 3 invitations" }).click()

        // It stays, with each person's link, and every link at once.
        const rows = page.locator("[data-invite-result]")
        await expect(rows).toHaveCount(3)
        await expect(page.locator("[data-invite-result='created']")).toHaveCount(3)
        expect(invited).toEqual(["ana@example.com", "ben@example.com", "cy@example.com"])
        await expect(page.getByText("Email isn't set up yet. Share these links, or set up email in Admin › Email.")).toBeVisible()
        await expect(page.getByRole("button", { name: "Copy the link for ben@example.com" })).toBeVisible()
        await expect(page).toHaveURL(/\/admin-setup/)
        if (use.viewport.width < 600) {
          // Each row's Copy link takes a finger's reach of its own.
          const reaches = await reachesIn(page, "[data-invite-results]")
          expect(reaches.length).toBe(3)
          expect(overlapping(reaches)).toEqual([])
        }
        await reviewShot(page, "first-run-invites-links", theme)

        await page.getByRole("button", { name: "Copy all links" }).click()
        await expect(page.getByText("3 invitation links copied", { exact: true })).toBeVisible()
        expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
          ["ana@example.com", "ben@example.com", "cy@example.com"].map((e) => `${e} — ${LINK(e)}`).join("\n"),
        )

        await page.getByRole("button", { name: "Open OneCamp" }).click()
        await page.waitForURL(/\/app\/home/, { timeout: 60_000 })
      })
    })
  }
}

// Design look DB-134: a refused row and a link side by side (email off), a
// sent row and one whose email failed (email on), and email on before
// sending, at 1280 and 390, light and dark.
for (const theme of SHOT_THEMES) {
  for (const [label, use] of [
    ["at 1280", { viewport: { width: 1280, height: 860 }, colorScheme: theme }],
    ["on a phone", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: theme }],
  ] as const) {
    test.describe(`the first run's mixed rounds, ${label}, ${theme}`, () => {
      test.use(use)

      test("email off: a refusal is an error, said whole, and a link is ready", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        await page.addInitScript((t) => localStorage.setItem("ui-theme", t), theme)
        await freshInstall(page, testInfo, {
          email: false,
          answer: (to) => (to === MEMBER ? withStatus(409, { msg: ALREADY }) : { invite_link: LINK(to), email_sent: false, email_error: "email isn't set up on this server" }),
        })
        await page.getByLabel("Email addresses").fill(`ana@example.com, ${MEMBER} `)
        await page.getByRole("button", { name: "Create 2 invitations" }).click()
        await expect(page.locator("[data-invite-result='refused']")).toContainText(ALREADY)
        await expect(page.locator("[data-invite-result='created'] [data-invite-mark='ready']")).toHaveCount(1)
        await expect(page.getByText(/Couldn't email/)).toHaveCount(0)
        await reviewShot(page, "first-run-invites-refused", theme)
      })

      test("email on: before sending it promises emails; after, only the failed email is amber", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        await page.addInitScript((t) => localStorage.setItem("ui-theme", t), theme)
        await freshInstall(page, testInfo, {
          email: true,
          answer: (to) => (to === "ben@example.com" ? { invite_link: LINK(to), email_sent: false, email_error: "the email provider had a problem; try again later" } : { invite_link: LINK(to), email_sent: true, email_error: "" }),
        })
        await expect(page.locator("[data-first-run-lead]")).toContainText("Each gets an email with a link to join, good for seven days.")
        await page.getByLabel("Email addresses").fill("ana@example.com, ben@example.com ")
        await expect(page.getByRole("button", { name: "Send 2 invitations and open OneCamp" })).toBeVisible()
        await reviewShot(page, "first-run-invites-email-on", theme)
        await page.getByRole("button", { name: "Send 2 invitations and open OneCamp" }).click()
        await expect(page.locator("[data-invite-result='sent']")).toHaveCount(1)
        await expect(page.getByText("Couldn't email it: the email provider had a problem; try again later")).toBeVisible()
        await reviewShot(page, "first-run-invites-email-failed", theme)
      })
    })
  }
}

test.describe("the first run's invitations with email set up, at 1280", () => {
  test.use({ viewport: { width: 1280, height: 860 } })

  test("sends each email and opens OneCamp at once", async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    const invited = await freshInstall(page, testInfo, { email: true })
    await expect(page.locator("[data-first-run-lead]")).toContainText("Each gets an email with a link to join, good for seven days.")
    await page.getByLabel("Email addresses").fill("ana@example.com, ben@example.com ")
    await page.getByRole("button", { name: "Send 2 invitations and open OneCamp" }).click()
    await page.waitForURL(/\/app\/home/, { timeout: 60_000 })
    expect(invited).toEqual(["ana@example.com", "ben@example.com"])
  })
})
