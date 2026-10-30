import { expect, test, type Page, type Request } from "@playwright/test"

import { BUSY_LOOK, busyPrimaryLook } from "./controlLook"
import { stubBackend, withStatus } from "./stubbedApp"

// A primary busy with its own action keeps its brand (main's ruling, 23 Oct
// 2026): disabled turned Sign in to the field's look mid-press, which read as
// unavailable or failed. Pressed, it stays in its own colours at full
// strength, with a spinner, until the server answers, and a second press
// sends nothing. With SHOTS_DIR set, the press is saved for review.

async function shot(page: Page, name: string, theme: string) {
  const dir = process.env.SHOTS_DIR
  if (!dir) return
  await page.screenshot({ path: `${dir}/${name}-${page.viewportSize()?.width}-${theme}.png` })
}

for (const theme of ["light", "dark"] as const) {
  for (const [label, use] of [
    ["at 1280", { viewport: { width: 1280, height: 860 }, colorScheme: theme }],
    ["on a phone", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: theme }],
  ] as const) {
    test.describe(`signing in ${label}, ${theme}`, () => {
      test.use(use)

      test("Sign in keeps its colours while it signs in, and takes no second press", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        let answer = () => {}
        const answered = new Promise<void>((resolve) => (answer = resolve))
        const sent: unknown[] = []
        await page.addInitScript((t) => localStorage.setItem("ui-theme", t), theme)
        await stubBackend(page, testInfo, {
          // No session: the page's own check (AuthService.hasActiveSession) is refused, so it draws the form.
          "/user/profile": withStatus(401, { msg: "Not signed in" }),
          // Passwords on: the shared stub's empty answer turns every method off, and the page says there's no way in.
          "/auth/providers": { providers: { email: true } },
          // Held until the test has looked, then refused, so the page stays put.
          "/auth/login": async (_url: URL, request: Request) => {
            sent.push(request.postDataJSON())
            await answered
            return withStatus(401, { msg: "The email or the password is wrong." })
          },
        })
        await page.goto("/", { waitUntil: "domcontentloaded", timeout: 120_000 })
        await page.getByLabel("Email address").fill("sam@example.com", { timeout: 60_000 })
        await page.getByRole("button", { name: "Continue with email" }).click()
        // Exact names: "Show password" and "Sign in with a passkey" sit beside these.
        await page.getByLabel("Password", { exact: true }).fill("correct horse")
        await page.getByRole("button", { name: "Sign in", exact: true }).click()
        const signingIn = page.getByRole("button", { name: "Signing in…" })
        await expect.poll(() => busyPrimaryLook(signingIn)).toEqual(BUSY_LOOK)
        await expect(signingIn).toBeEnabled()
        await signingIn.press("Enter")
        await shot(page, "signin-busy", theme)
        answer()
        await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible()
        expect(sent).toHaveLength(1)
      })
    })
  }
}
