import { expect, test } from "@playwright/test"

import { SAM, SHOT_THEMES, expectEveryCallAnswered, reviewShot, stubBackend } from "./stubbedApp"
import { SCREENS, press, screenUse } from "./screens"

// ADMIN-16: a new agent acted on its own unless someone thought to change it.
// Now it starts on "Ask first", marked Recommended and listed first, at 1280
// and on a phone (the editor's drawer), light and dark.

const ADMIN = { ...SAM, user_is_admin: true }
const QUIET = {
  "/user/profile": { msg: "ok", data: ADMIN },
  "/config/client": { msg: "ok", data: { features: { ai: true } } },
  "/me/capabilities": { msg: "ok", data: { "agent.manage": true } },
  "/agents/overview": { msg: "ok", data: {} },
  "/agents/health": { msg: "ok", data: {} },
  "/agents/eval/summary": { msg: "ok", data: {} },
  "/agents/outcomes": { msg: "ok", data: {} },
  "/agents/skills": { msg: "ok", data: [] },
  // Without these "/agents" would answer the activity feed and the work list
  // with the agents themselves.
  "/agents/activity": { msg: "ok", data: [] },
  "/agents/work": { msg: "ok", data: [] },
  "/agents": { msg: "ok", data: [] },
  // What the page and the editor read beside the agents, quiet.
  "/agent-skills": { msg: "ok", data: [] },
  "/mcp/servers": { msg: "ok", data: [] },
  "/mcp/catalog": { msg: "ok", data: [] },
  "/data-sources": { msg: "ok", data: [] },
  "/ai/activity": { msg: "ok", data: [] },
  "/ai/governance-drill": { msg: "ok", data: null },
  "/ai/status": { msg: "ok", data: { enabled: true, provider: "ollama", model: "qwen3" } },
  "/admin/ai/authorized-models": { msg: "ok", data: [] },
  "/ch/allActiveChannels": { msg: "ok", channels_list: [] },
  "/user/userProjectList": { msg: "ok", data: { user_projects: [] } },
}

// One agent in each mode. Asking first is the default, so the list marks only
// what differs from it: "Plans first", and "Acts on its own" in the warning
// ink, the one an admin scans for (DESIGN-BUILD-143 F1).
const agent = (id: string, name: string, autonomy: string) => ({
  id,
  name,
  description: "Keeps the launch on track.",
  instructions: "File the launch tasks.",
  enabled_tools: "[]",
  trigger_type: "mention",
  trigger_config: "{}",
  scope: "{}",
  max_steps: 4,
  is_active: true,
  dm_able: false,
  autonomy,
  run_count: 3,
})
const MODES = [
  { name: "Release Captain", autonomy: "approval", chip: null },
  { name: "Planner", autonomy: "plan", chip: "Plans first" },
  { name: "Lookout", autonomy: "auto", chip: "Acts on its own" },
]
const CHIPS = ["Asks first", "Plans first", "Acts on its own"]

for (const scheme of SHOT_THEMES) {
  for (const screen of SCREENS) {
    test.describe(`${screen.name}, ${scheme}`, () => {
      test.use(screenUse(screen, scheme))

      test("New agent: Ask first is chosen and marked Recommended", async ({ page }, testInfo) => {
        test.setTimeout(240_000)
        await stubBackend(page, testInfo, QUIET)
        await page.addInitScript(() => localStorage.setItem("oc_keys_tip_seen", "1"))
        await page.goto("/app/settings/agents", { waitUntil: "domcontentloaded", timeout: 180_000 })
        await press(screen, page.getByRole("button", { name: /^New agent/ }).first())
        const editor = page.getByRole("dialog", { name: "New agent" })
        await expect(editor).toBeVisible({ timeout: 60_000 })
        await editor.getByLabel("Name").fill("Release Captain")
        await editor.getByLabel("Instructions").fill("File the launch tasks.")
        for (let i = 0; i < 2; i++) await press(screen, editor.getByRole("button", { name: /^Next/ }))
        const choice = editor.getByRole("radiogroup", { name: "Autonomy for write actions" })
        await choice.scrollIntoViewIfNeeded()
        const first = choice.getByRole("radio").first()
        await expect(first).toHaveAttribute("aria-checked", "true")
        await expect(first).toContainText("Ask first")
        await expect(first).toContainText("Recommended")
        await expect(choice).not.toContainText("90/10")
        await reviewShot(page, "agent-ask-first", scheme)
        await expectEveryCallAnswered(page)
      })

      // DESIGN-BUILD-143 F2: the default moved, and Radix sends Tab to the
      // checked radio, so the group's first keyboard stop is now Ask first.
      test("New agent, keyboard: Tab lands on Ask first; ArrowDown chooses Plan, then ask", async ({ page }, testInfo) => {
        test.skip(screen.hasTouch, "a keyboard path: at 1280")
        test.setTimeout(240_000)
        await stubBackend(page, testInfo, QUIET)
        await page.addInitScript(() => localStorage.setItem("oc_keys_tip_seen", "1"))
        await page.goto("/app/settings/agents", { waitUntil: "domcontentloaded", timeout: 180_000 })
        await press(screen, page.getByRole("button", { name: /^New agent/ }).first())
        const editor = page.getByRole("dialog", { name: "New agent" })
        await expect(editor).toBeVisible({ timeout: 60_000 })
        await editor.getByLabel("Name").fill("Release Captain")
        await editor.getByLabel("Instructions").fill("File the launch tasks.")
        for (let i = 0; i < 2; i++) await press(screen, editor.getByRole("button", { name: /^Next/ }))
        const choice = editor.getByRole("radiogroup", { name: "Autonomy for write actions" })
        const ask = choice.getByRole("radio", { name: /^Ask first/ })
        const plan = choice.getByRole("radio", { name: /^Plan, then ask/ })
        // From the control before the group, one Tab.
        await editor.getByRole("button", { name: "Add skill", exact: true }).focus()
        await page.keyboard.press("Tab")
        await expect(ask).toBeFocused()
        await expect(ask).toHaveAttribute("aria-checked", "true")
        await reviewShot(page, "agent-ask-first-keys", scheme)
        // Held as a person holds a key: Radix moves focus a task after keydown and
        // checks only while the arrow is still down, so an instant keyup raced it.
        await page.keyboard.press("ArrowDown", { delay: 100 })
        await expect(plan).toBeFocused()
        await expect(plan).toHaveAttribute("aria-checked", "true")
        await expect(ask).toHaveAttribute("aria-checked", "false")
        await expectEveryCallAnswered(page)
      })

      test("Agents list: Plans first, and Acts on its own in the warning ink; no chip for asking first", async ({ page }, testInfo) => {
        test.setTimeout(240_000)
        await stubBackend(page, testInfo, {
          ...QUIET,
          "/agents": { msg: "ok", data: MODES.map((m, i) => agent(`a${i}`, m.name, m.autonomy)) },
        })
        await page.addInitScript(() => localStorage.setItem("oc_keys_tip_seen", "1"))
        await page.goto("/app/settings/agents", { waitUntil: "domcontentloaded", timeout: 180_000 })
        for (const m of MODES) {
          const card = page.locator("[data-agent-card]").filter({ hasText: m.name })
          await expect(card).toBeVisible({ timeout: 60_000 })
          for (const chip of CHIPS) {
            if (chip === m.chip) await expect(card.getByText(chip, { exact: true })).toBeVisible()
            else await expect(card.getByText(chip, { exact: true })).toHaveCount(0)
          }
          if (m.autonomy === "auto") await expect(card.getByText("Acts on its own", { exact: true })).toHaveClass(/\btext-warning-ink\b/)
        }
        // On a phone the third card is below the fold: the frame shows the one that acts on its own.
        await page.locator("[data-agent-card]").filter({ hasText: "Lookout" }).scrollIntoViewIfNeeded()
        await reviewShot(page, "agent-chips", scheme)
        await expectEveryCallAnswered(page)
      })
    })
  }
}
