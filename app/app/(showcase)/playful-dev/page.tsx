import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { PlayfulShowcase } from "./PlayfulShowcase"

export const metadata: Metadata = {
  title: "Playful layer",
  robots: { index: false, follow: false },
}

/**
 * /app/playful-dev: every token, mark, motif, illustration and motion of the
 * playful layer in one place, in the current theme, for the people building
 * the app to see and screenshot. Linked from nowhere.
 *
 * It never ships to a customer: any production build answers 404, so it
 * exists only under next dev. The (showcase) group keeps it out of the mobile
 * navigation's per-section titles without changing its address.
 * showcaseGuard.test.ts holds the guard in place.
 */
export default function PlayfulPage() {
  if (process.env.NODE_ENV === "production") notFound()
  return <PlayfulShowcase />
}
