import { expect, test } from "@playwright/test"

import { SAM, stubBackend, withStatus } from "../stubbedApp"

/**
 * A copy of a published page, started while signed out (docs C6): "Copy to
 * my workspace" lands on the sign-in card, and once the person has signed in
 * the copy goes ahead by itself and opens, with no second trip to the page.
 * The sign-in is the real one, the email form on the start page, so this goes
 * through the app shell where every way in lands.
 */
test("a copy started while signed out goes ahead after sign-in", async ({ page }, testInfo) => {
  test.setTimeout(180_000)
  let signedIn = false
  const copies: string[] = []
  await stubBackend(page, testInfo, {
    "/auth/providers": { providers: { email: true, google: false, github: false, oidc: false, saml: false, ldap: false, demo: false } },
    "/user/profile": () => (signedIn ? { msg: "ok", data: SAM } : withStatus(401, { msg: "Sign in again." })),
    // The session's renewal, as the server answers it: refused while nobody is signed in.
    "/refreshToken": () => (signedIn ? { msg: "ok" } : withStatus(401, { msg: "Sign in again." })),
    "/auth/login": () => {
      signedIn = true
      return { msg: "ok" }
    },
    "/guest/links/copy": () => {
      if (!signedIn) return withStatus(401, { msg: "Sign in again." })
      copies.push("launch-notes")
      return { doc_uuid: "copy-1" }
    },
  })

  await page.goto("/p/launch-notes?copy=1", { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect(page.getByRole("heading", { name: "Sign in to copy this page" })).toBeVisible({ timeout: 60_000 })
  expect(copies).toHaveLength(0)

  await page.getByRole("link", { name: "Sign in" }).or(page.getByRole("button", { name: "Sign in" })).first().click()
  await page.getByLabel("Email address").fill("sam@example.com", { timeout: 60_000 })
  await page.getByRole("button", { name: "Continue with email" }).click()
  await page.getByLabel("Password", { exact: true }).fill("a long enough password", { timeout: 30_000 })
  await page.getByRole("button", { name: "Sign in", exact: true }).click()

  await page.waitForURL(/\/app\/doc\/copy-1$/, { timeout: 90_000 })
  expect(copies).toEqual(["launch-notes"])
})
