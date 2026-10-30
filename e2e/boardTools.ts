import { expect, type Locator } from "@playwright/test"

/**
 * A board's tool row (Excalidraw's .App-toolbar): every tool and the More-tools
 * trigger beside them share one centre line, and on a touch phone the trigger is
 * as big a target as the tools (44px). It kept Excalidraw's own 32px there and
 * sat 6px above them (DESIGN-BUILD-27).
 */
export async function expectToolsInLine(board: Locator, touch: boolean) {
  const row = board.locator(".App-toolbar").first()
  await expect(row.locator(".App-toolbar__extra-tools-trigger")).toBeVisible({ timeout: 30_000 })
  const boxes = await row.locator("label.ToolIcon, .App-toolbar__extra-tools-trigger").evaluateAll((els) =>
    els.map((el) => {
      const b = el.getBoundingClientRect()
      return { more: el.classList.contains("App-toolbar__extra-tools-trigger"), mid: b.top + b.height / 2, height: b.height }
    }),
  )
  const more = boxes.find((b) => b.more)!
  const tools = boxes.filter((b) => !b.more)
  expect(tools.length, "the row's tools").toBeGreaterThan(3)
  expect(tools.map((t) => Math.round(Math.abs(t.mid - more.mid))), "each tool's centre against the trigger's").toEqual(tools.map(() => 0))
  if (touch) expect(more.height, "the trigger's height on a touch phone").toBeGreaterThanOrEqual(44)
}
