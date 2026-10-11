import { readFile } from "node:fs/promises"
import { join } from "node:path"

/**
 * The build this server is running, for the "A new version is ready" pill
 * (design v3, shell T3). The page carries the id it was built with
 * (NEXT_PUBLIC_BUILD_ID, set in next.config.ts); when this answers with
 * another, a deploy has happened since the tab opened.
 *
 * Read from .next/BUILD_ID at request time, never cached: a static answer
 * would be the old build's own id forever.
 */
export const dynamic = "force-dynamic"

export async function GET() {
  let id = process.env.NEXT_PUBLIC_BUILD_ID || ""
  try {
    id = (await readFile(join(process.cwd(), ".next", "BUILD_ID"), "utf8")).trim() || id
  } catch {
    /* no build directory (dev): the baked id stands */
  }
  return new Response(JSON.stringify({ id }), {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  })
}
