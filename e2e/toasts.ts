import type { Locator, Page } from "@playwright/test"

/**
 * A toast's words, read where the toast is drawn: the app's one toast list
 * (components/ui/toast.tsx, labelled "Notifications (Alt+T)"). While a toast
 * opens, Radix's announcer repeats its words for screen readers for about a
 * second, outside the list ("Notification <words>"), so a page-wide getByText
 * matches twice and a strict read fails whenever it lands in that second.
 * Exact words, so a title and its description are read apart.
 */
export function toast(page: Page, words: string): Locator {
  return page.getByRole("region", { name: "Notifications (Alt+T)", exact: true }).getByText(words, { exact: true })
}
