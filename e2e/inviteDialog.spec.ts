import { expect, test, type Page, type Request, type TestInfo } from "@playwright/test"

import { SAM, SHOT_THEMES, expectEveryCallAnswered, expectHomeSettled, reviewShot, stubBackend, withStatus, type Answers } from "./stubbedApp"
import { SCREENS, press, screenUse } from "./screens"
import { overlapping, reachesIn } from "./touchReach"

// The invite form is a lazy dialog (lib/lazy/lazyDialog, the doc route's
// payback, 23 Oct 2026): every signed-in screen may open it, from the
// workspace menu on a computer and from the You sheet on a phone, and its code
// comes the first time it opens. In a production build it has to come, open
// as itself, close, and open again. On a phone the You sheet hides while the
// form shows (components/drawers/sheetHandoff), so a form that never came
// would leave nothing on the screen. On a server that can't send email yet
// the form promises links, not emails, and hands each one over (SHELL-02);
// with SHOTS_DIR=<dir> that is saved at 1280 and 390, light and dark.

async function home(page: Page, testInfo: TestInfo, more: Answers = {}) {
  await stubBackend(page, testInfo, {
    // Someone who may invite: only they are offered "Invite people".
    "/me/capabilities": { msg: "ok", data: { "invitation.create": true } },
    // Home's own reads, answered empty: a "Not found" toast is a layer too.
    "/activity/unified": { msg: "ok", data: null },
    "/user/assignedTaskList": { msg: "ok", data: null },
    "/event/getEvents": { msg: "ok", data: null },
    "/project/overview": { msg: "ok", data: { projects: [] } },
    "/ch/suggested": { msg: "ok", data: [] },
    ...more,
  })
  await page.goto("/app/home", { waitUntil: "domcontentloaded", timeout: 180_000 })
  await expectHomeSettled(page)
}

/** The invite form, open: an address typed in its field makes Send ready, and Cancel closes it. */
async function opensAndCloses(page: Page) {
  const form = page.getByRole("dialog", { name: "Invite people" })
  await expect(form).toBeVisible({ timeout: 60_000 })
  await form.getByLabel("Email addresses").fill("priya@example.com")
  await expect(form.getByRole("button", { name: "Send invitation" })).toBeEnabled()
  await form.getByRole("button", { name: "Cancel" }).click()
  await expect(form).toBeHidden()
}

test.describe("a computer", () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test("the workspace menu's Invite people opens the invite form, and again once it's closed", async ({ page }, testInfo) => {
    test.setTimeout(240_000)
    await home(page, testInfo)
    for (let round = 0; round < 2; round++) {
      await page.getByRole("button", { name: / workspace menu$/ }).click({ timeout: 120_000 })
      await page.getByRole("menuitem", { name: "Invite people" }).click()
      await opensAndCloses(page)
    }
  })
})

test.describe("a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  test("the You sheet hands over to the invite form, and both are gone once it's closed", async ({ page }, testInfo) => {
    test.setTimeout(240_000)
    await home(page, testInfo)
    await page.getByRole("button", { name: "Your profile" }).first().click({ timeout: 120_000 })
    const you = page.locator("[data-you-status]")
    await expect(you).toBeVisible({ timeout: 60_000 })
    await page.getByRole("button", { name: "Invite people" }).click()
    await expect(you).toBeHidden()
    await opensAndCloses(page)
    await expect(you).toBeHidden()
  })
})

// The free plan's limit, met where an admin invites (ADMIN-02): at 23 of 25,
// Members says so before anyone types, and three addresses in the form say
// that one won't fit, with the way past the limit the server names. One note
// for both; the number is the server's.
const ADMIN = { ...SAM, user_is_admin: true }
const PLAN_LINKS = {
  licence: "https://shop.example/buy?plan=lifetime",
  cloud: "https://shop.example/buy?plan=cloud",
  account: "https://shop.example/account",
  pricing: "https://shop.example/pricing",
}
const CONTROLS = ["sso", "ldap", "scim", "audit_export"]
const PLAN = {
  status: "success",
  data: {
    plan: "free",
    used: 23,
    limit: 25,
    free_plan: true,
    locked: CONTROLS,
    controls: CONTROLS.map((key) => ({ key, included: false })),
    release: { running: "v2.79.0", edition: "v2" },
    managed: false,
    hosting: "self",
    upgrade_url: "https://shop.example/buy",
    links: PLAN_LINKS,
  },
}

for (const scheme of SHOT_THEMES) {
  for (const screen of SCREENS) {
    test.describe(`an admin at the limit, ${screen.name}, ${scheme}`, () => {
      test.use(screenUse(screen, scheme))

      test("at 23 of 25, Members and the invite form say so, with Remove the 25-person limit", async ({ page }, testInfo) => {
        test.setTimeout(240_000)
        await stubBackend(page, testInfo, {
          "/user/profile": { msg: "ok", data: ADMIN },
          "/admin/plan": PLAN,
          "/admin/getAllUsersList": { msg: "ok", data: [ADMIN], has_more: false },
          "/admin/getAllAdminUsers": { msg: "ok", data: [ADMIN], has_more: false },
          "/admin/getAllInvitations": { msg: "ok", data: [] },
        })
        await page.addInitScript(() => localStorage.setItem("oc_keys_tip_seen", "1"))
        await page.goto("/app/admin?tab=users", { waitUntil: "domcontentloaded", timeout: 180_000 })

        const members = page.locator("[data-people-notice] [data-seat-limit-note]")
        await expect(members.getByRole("status")).toHaveText("Free plan: 23 of 25 people, 2 places left.", { timeout: 120_000 })
        await expect(members.getByRole("link", { name: "Remove the 25-person limit" })).toHaveAttribute("href", PLAN_LINKS.licence)
        await reviewShot(page, "admin-members-limit", scheme)
        // DB-134 F1: while the note shows it is the one figure; the toolbar's meter steps aside.
        await expect(page.locator("[data-seat-meter]")).toHaveCount(0)
        await expect(page.locator(".people-meter-track")).toHaveCount(1)
        await reviewShot(page, "fix-admin-members-limit", scheme)
        // DB-134 F3: the way past the limit by keyboard, with its ring.
        if (!screen.hasTouch) {
          const link = members.getByRole("link", { name: "Remove the 25-person limit" })
          await link.focus()
          await page.keyboard.press("Shift+Tab")
          await page.keyboard.press("Tab")
          await expect(link).toBeFocused()
          expect(await link.evaluate((el) => el.matches(":focus-visible") && getComputedStyle(el).outlineStyle !== "none")).toBe(true)
          await reviewShot(page, "fix-admin-members-limit-focus", scheme)
        }
        // DB-134 F3: "How" open on the note.
        await press(screen, members.getByText("How", { exact: true }))
        await expect(members.locator("details[open]")).toHaveCount(1)
        await reviewShot(page, "fix-admin-members-how", scheme)

        const invite = screen.hasTouch ? page.locator("[data-people-fab]") : page.getByRole("button", { name: /^Invite people/ })
        await press(screen, invite)
        const form = page.getByRole("dialog", { name: "Invite people" })
        await expect(form).toBeVisible({ timeout: 60_000 })
        await form.getByLabel("Email addresses").fill("ana@example.com, bo@example.com, cy@example.com")
        const note = form.locator("[data-seat-limit-note]")
        await expect(note.getByRole("status")).toHaveText("2 places left on the free plan. 1 of these won't fit.")
        const remove = note.getByRole("link", { name: "Remove the 25-person limit" })
        await expect(remove).toHaveAttribute("href", PLAN_LINKS.licence)
        await expect(remove).toHaveAttribute("target", "_blank")
        await expect(note.getByRole("link", { name: "Prices" })).toHaveAttribute("href", PLAN_LINKS.pricing)
        if (screen.hasTouch) expect((await remove.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
        await reviewShot(page, "admin-invite-limit", scheme)
        await expectEveryCallAnswered(page)
      })
    })
  }
}

// A member who may invite meets the limit as a refusal: the server's 403
// seat_limit carries the plan's figure. One note says the plan is full and to
// ask an admin, with nothing to buy, and the member never asks for the plan,
// which is an admin's (an unanswered /admin/plan would fail the test).
const SEAT_REFUSAL = withStatus(403, { status: "failed", code: "seat_limit", limit: 25, msg: "This workspace has reached its limit of 25 people." })

for (const scheme of SHOT_THEMES) {
  for (const screen of SCREENS) {
    test.describe(`a member at the limit, ${screen.name}, ${scheme}`, () => {
      test.use(screenUse(screen, scheme))

      test("a refused invitation says the plan is full and to ask an admin, with nothing to buy", async ({ page }, testInfo) => {
        test.setTimeout(240_000)
        // Home's greeting turns for two minutes; the shot is of the form, taken once the page is still.
        await page.emulateMedia({ reducedMotion: "reduce" })
        // The phone's You sheet reads the approvals that wait on this person.
        await home(page, testInfo, { "/invitations": SEAT_REFUSAL, "/approvals/waiting": { msg: "ok", data: { items: [] } } })
        if (screen.hasTouch) {
          await press(screen, page.getByRole("button", { name: "Your profile" }).first())
          await press(screen, page.getByRole("button", { name: "Invite people" }))
        } else {
          await page.getByRole("button", { name: / workspace menu$/ }).click({ timeout: 120_000 })
          await page.getByRole("menuitem", { name: "Invite people" }).click()
        }
        const form = page.getByRole("dialog", { name: "Invite people" })
        await expect(form).toBeVisible({ timeout: 60_000 })
        await form.getByLabel("Email addresses").fill("ana@example.com")
        await press(screen, form.getByRole("button", { name: "Send invitation" }))
        const note = form.locator("[data-seat-limit-note]")
        await expect(note.getByRole("status")).toHaveText("This workspace's free plan is full.")
        await expect(note).toContainText("Ask an admin to remove the 25-person limit.")
        await expect(note.getByRole("link")).toHaveCount(0)
        await expect(form.getByLabel("Email addresses")).toHaveAttribute("aria-describedby", /invite-email-seats/)
        await reviewShot(page, "member-invite-limit", scheme)
        // DB-134 F2: Send steps back until the addresses change, and Close is the way out.
        await expect(page.getByRole("button", { name: "Send invitation" })).toBeDisabled()
        await expect(page.getByRole("button", { name: "Cancel" })).toHaveCount(0)
        await expect(page.locator("button[data-interactive='button']", { hasText: "Close" })).toBeVisible()
        await reviewShot(page, "fix-member-invite-limit", scheme)
        await expectEveryCallAnswered(page)
      })
    })
  }
}

/** Opens the invite form: the workspace menu on a computer, the You sheet on a phone. */
async function openForm(page: Page, phone: boolean) {
  if (phone) {
    await page.getByRole("button", { name: "Your profile" }).first().click({ timeout: 120_000 })
    await page.getByRole("button", { name: "Invite people" }).click()
  } else {
    await page.getByRole("button", { name: / workspace menu$/ }).click({ timeout: 120_000 })
    await page.getByRole("menuitem", { name: "Invite people" }).click()
  }
}

const LINK = (email: string) => `https://camp.example.com/signup?token=${encodeURIComponent(email)}`

for (const theme of SHOT_THEMES) {
  for (const [label, use] of [
    ["a computer", { viewport: { width: 1280, height: 800 }, colorScheme: theme }],
    ["a phone", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: theme }],
  ] as const) {
    test.describe(`${label} on a server without email, ${theme}`, () => {
      // Reduced motion, as homeGreeting.spec.ts: on a computer Home's greeting orbits for minutes, so a shot would wait on it.
      test.use({ ...use, permissions: ["clipboard-read", "clipboard-write"], contextOptions: { reducedMotion: "reduce" } })

      test("the invite form promises links, not emails, and hands each one over", async ({ page }, testInfo) => {
        test.setTimeout(240_000)
        await page.addInitScript((t) => localStorage.setItem("ui-theme", t), theme)
        const invited: string[] = []
        await home(page, testInfo, {
          "/config/client": { msg: "ok", data: { email_enabled: false } },
          "/invitations": (_url: URL, request: Request) => {
            const to = (request.postDataJSON() as { email: string }).email
            invited.push(to)
            return { invite_link: LINK(to), email_sent: false, email_error: "email isn't set up on this server" }
          },
        })
        const phone = use.viewport.width < 600
        await openForm(page, phone)
        const form = page.getByRole("dialog", { name: "Invite people" })
        await expect(form).toBeVisible({ timeout: 60_000 })
        await expect(form).toContainText("This server can't send email yet, so you'll get a link to share with each person yourself.")
        await expect(form).not.toContainText("gets an email")
        await form.getByLabel("Email addresses").fill("ana@example.com, ben@example.com ")
        await reviewShot(page, "invite-dialog-email-off", theme)
        await form.getByRole("button", { name: "Create 2 invitations" }).click()

        // Sent, the form is named for its rows, "Invitations".
        const rows = page.getByRole("dialog", { name: "Invitations" })
        await expect(rows.locator("[data-invite-result='created']")).toHaveCount(2)
        expect(invited).toEqual(["ana@example.com", "ben@example.com"])
        // Said once over the rows; each row is ready (DB-134 F1).
        await expect(rows.getByText("Email isn't set up yet. Share these links yourself.")).toHaveCount(1)
        await expect(rows.getByText(/Couldn't email/)).toHaveCount(0)
        await expect(rows.getByRole("button", { name: "Copy the link for ben@example.com" })).toBeVisible()
        if (phone) {
          // Each row's Copy link takes a finger's reach of its own.
          const reaches = await reachesIn(page, "[data-invite-results]")
          expect(reaches.length).toBe(2)
          expect(overlapping(reaches)).toEqual([])
        }
        await reviewShot(page, "invite-dialog-links", theme)

        await rows.getByRole("button", { name: "Copy all links" }).click()
        await expect(page.getByText("2 invitation links copied", { exact: true })).toBeVisible()
        expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
          ["ana@example.com", "ben@example.com"].map((e) => `${e} — ${LINK(e)}`).join("\n"),
        )
      })
    })
  }
}

// Design look DB-134: a refused row beside a ready link (email off), a sent
// row beside a failed email (email on), and email on before sending.
const MEMBER = "priya.venkataraman-iyer@kestrel-studio.example"
const ALREADY = `${MEMBER} is already a member of this workspace.`

for (const theme of SHOT_THEMES) {
  for (const [label, use] of [
    ["a computer", { viewport: { width: 1280, height: 800 }, colorScheme: theme }],
    ["a phone", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: theme }],
  ] as const) {
    test.describe(`${label}'s mixed invitation rounds, ${theme}`, () => {
      test.use({ ...use, contextOptions: { reducedMotion: "reduce" } })
      const phone = use.viewport.width < 600

      test("email off: the line is said once, a refusal whole, a link ready", async ({ page }, testInfo) => {
        test.setTimeout(240_000)
        await page.addInitScript((t) => localStorage.setItem("ui-theme", t), theme)
        await home(page, testInfo, {
          "/config/client": { msg: "ok", data: { email_enabled: false } },
          "/invitations": (_url: URL, request: Request) => {
            const to = (request.postDataJSON() as { email: string }).email
            return to === MEMBER ? withStatus(409, { msg: ALREADY }) : { invite_link: LINK(to), email_sent: false, email_error: "email isn't set up on this server" }
          },
        })
        await openForm(page, phone)
        const form = page.getByRole("dialog", { name: "Invite people" })
        await form.getByLabel("Email addresses").fill(`ana@example.com, ${MEMBER} `)
        await form.getByRole("button", { name: "Create 2 invitations" }).click()
        const rows = page.getByRole("dialog", { name: "Invitations" })
        await expect(rows.locator("[data-invite-result='refused']")).toContainText(ALREADY)
        await expect(rows.getByText("Email isn't set up yet. Share these links yourself.")).toHaveCount(1)
        await expect(rows.locator("[data-invite-mark='ready']")).toHaveCount(1)
        await expect(rows.getByText(/Couldn't email/)).toHaveCount(0)
        await reviewShot(page, "invite-dialog-refused", theme)
      })

      test("email on: it promises emails; after, only the failed email is amber", async ({ page }, testInfo) => {
        test.setTimeout(240_000)
        await page.addInitScript((t) => localStorage.setItem("ui-theme", t), theme)
        await home(page, testInfo, {
          "/config/client": { msg: "ok", data: { email_enabled: true } },
          "/invitations": (_url: URL, request: Request) => {
            const to = (request.postDataJSON() as { email: string }).email
            return to === "ben@example.com"
              ? { invite_link: LINK(to), email_sent: false, email_error: "the email provider had a problem; try again later" }
              : { invite_link: LINK(to), email_sent: true, email_error: "" }
          },
        })
        await openForm(page, phone)
        const form = page.getByRole("dialog", { name: "Invite people" })
        await expect(form).toContainText("Each gets an email with a link to join, good for seven days.")
        await form.getByLabel("Email addresses").fill("ana@example.com, ben@example.com ")
        await expect(form.getByRole("button", { name: "Send 2 invitations" })).toBeVisible()
        await reviewShot(page, "invite-dialog-email-on", theme)
        await form.getByRole("button", { name: "Send 2 invitations" }).click()
        const rows = page.getByRole("dialog", { name: "Invitations" })
        await expect(rows.locator("[data-invite-result='sent']")).toHaveCount(1)
        await expect(rows.getByText("Couldn't email it: the email provider had a problem; try again later")).toBeVisible()
        await reviewShot(page, "invite-dialog-email-failed", theme)
      })
    })
  }
}
