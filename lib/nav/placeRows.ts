import { OWN_ERRORS } from "@/lib/axiosInstance"
import { rememberDocIcon } from "@/lib/docLook"
import { LayoutDashboard } from "@/lib/icons"
import { useFetch } from "@/hooks/useFetch"
import type { Envelope } from "@/services/docGraphService"
import type { Place } from "@/types/docGraph"
import type { DesktopChildrenNavType } from "@/types/nav"
import { app_board_path, app_doc_path } from "@/types/paths"

// A person's places as navigation rows (miro-46): what they starred, and what
// they opened lately of one kind, for the sidebar and the phone's More alike.
// Only what the person can still open comes: the server drops a star or a
// recent entry when access to it goes (business/Places), so a row never leads
// to a page that says no.

/** The page of each kind of place the navigation can open. */
const PAGES: Record<string, string> = { doc: app_doc_path, board: app_board_path }

/**
 * Places as rows, in the order they came: a doc wears its own glyph in its hue,
 * a board the boards' icon (lib/placeHue: a board has no hue of its own, so its
 * row tints in the accent). Each opens where the server says, and is the
 * current row on its own page (path is the pathname's segments). A kind the
 * navigation can't open is left out.
 */
export function placeRows(places: readonly (Place | null | undefined)[], path: readonly string[]): DesktopChildrenNavType[] {
  const rows: DesktopChildrenNavType[] = []
  for (const p of places) {
    const page = p && PAGES[p.resource_kind]
    if (!page) continue
    const doc = p.resource_kind === "doc"
    // A doc's icon, for the lists that name a doc without it (lib/docLook).
    if (doc) rememberDocIcon(p.resource_uuid, p.icon)
    rows.push({
      title: p.title || (doc ? "Untitled" : "Untitled board"),
      path: p.href || `${page}/${p.resource_uuid}`,
      hue_id: p.resource_uuid,
      variant: path[2] === p.resource_kind && path[3] === p.resource_uuid ? "sidebarActive" : "ghost",
      ...(doc ? { kind: "doc" as const, doc_icon: p.icon } : { icon: LayoutDashboard }),
    })
  }
  return rows
}

/** How many recent places the navigation lists: a section's worth, never a page of them. */
const RECENT_ROWS = 5

/** What the person opened lately of a kind, as its cache key (GET /places/recent, newest first). */
export const recentPlacesKey = (kind: string) => `/places/recent?resource_kind=${kind}&limit=${RECENT_ROWS}`

const NONE: Place[] = []

/**
 * What the person opened lately of a kind, newest first. Nothing while it
 * comes, when it fails or offline: the list stays quiet then, and its section
 * isn't drawn. The server may send fewer than asked (what the person can no
 * longer open is dropped after the count).
 */
export function useRecentPlaces(kind: string): Place[] {
  const { data } = useFetch<Envelope<{ places?: Place[] }>>(recentPlacesKey(kind), undefined, undefined, OWN_ERRORS)
  return data?.data?.places ?? NONE
}
