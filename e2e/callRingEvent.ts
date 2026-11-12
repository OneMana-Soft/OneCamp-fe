import { expect, type Page } from "@playwright/test"

// A ring as the MQTT handler passes it on (slack-06 H2): the "onecamp:call-ring" window event. The callee's card and
// the caller's own ring (CallerRinging) listen for it once they mount, so `ring` sends it until they show it.

/** A MESSAGE_CALL_RING as the handler passes it on, its ring_until `ms` from the page's own clock, sent until `until` holds. */
export async function ring(page: Page, data: Record<string, unknown>, until: () => Promise<void>, ms = 120_000) {
  await expect(async () => {
    await page.evaluate(
      ([d, left]) => window.dispatchEvent(new CustomEvent("onecamp:call-ring", { detail: { ...d, ring_until: new Date(Date.now() + left).toISOString() } })),
      [data, ms] as const,
    )
    await until()
  }).toPass({ timeout: 60_000, intervals: [500, 1000, 2000] })
}

/** A ring's message sent once (a decline, a call that ended). */
export const tell = (page: Page, data: Record<string, unknown>) => page.evaluate((d) => window.dispatchEvent(new CustomEvent("onecamp:call-ring", { detail: d })), data)
