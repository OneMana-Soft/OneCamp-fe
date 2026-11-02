import axiosInstance from "@/lib/axiosInstance"
import { chordWords, isMacLike } from "@/lib/keys/chord"
import { offerPaletteEntries, type PaletteEntry } from "@/lib/ui/paletteEntries"
import { TABLE_SURFACE, tableKeyChord, type TableCommand } from "@/lib/tables/tableKeys"
import { tablePath } from "@/lib/tables/route"
import { GetEndpointUrl } from "@/services/endPoints"
import type { DataTable } from "@/services/tableService"

/**
 * A table's switchers in the palette (airtable-04, AV-7), a chunk of their
 * own: "Switch table…", which the table page offers once this has come, and
 * "Switch view…", its views menu's (TableViews). ⌘J and ⌘⇧K open the palette
 * on them (lib/tables/tableKeys); ⌘K finds them by name, their keys beside.
 * No page loads this first (app/firstLoad.test.ts).
 */

const MAC_KEYS: Record<string, string> = { Mod: "⌘", Meta: "⌘", Ctrl: "⌃", Alt: "⌥", Shift: "⇧", Enter: "⏎" }

/** A chord as a menu or the palette writes it beside an action: 'Mod-Shift-k' is "⌘⇧K" on a Mac, "Ctrl+Shift+K" elsewhere. Pure. */
export function chordSymbols(chord: string, mac: boolean): string {
  const parts = chord.split(/-(?!$)/)
  return mac ? parts.map((p) => MAC_KEYS[p] ?? chordWords(p)).join("") : parts.map((p) => (p === "Mod" ? "Ctrl" : chordWords(p))).join("+")
}

/** A command's key as the palette writes it beside the action: "⌘J" on a Mac, "Ctrl+J" elsewhere. */
export function paletteKeys(command: TableCommand): string | undefined {
  const mac = isMacLike()
  const chord = tableKeyChord(command, mac)
  return chord && chordSymbols(chord, mac)
}

/**
 * "Switch table…" while a table is open, until the returned stop: the
 * workspace's tables (GET /tables, as the tables list reads them), this one
 * marked; a pick opens it.
 */
export function offerTableSwitch(tableId: string, router: { push(href: string): void }): () => void {
  const entry: PaletteEntry = {
    id: "switch-table",
    label: "Switch table…",
    keywords: ["table", "tables", "switch", "go to", "open"],
    keys: paletteKeys("switchTable"),
    choices: async () => {
      const tables = ((await axiosInstance.get(GetEndpointUrl.GetTables)).data?.data as DataTable[] | undefined) ?? []
      return tables.map((t) => ({ value: t.id, label: t.name || "Untitled table", current: t.id === tableId }))
    },
    apply: (id) => {
      if (id !== tableId) router.push(tablePath(id))
    },
  }
  return offerPaletteEntries({ id: TABLE_SURFACE, group: "This table", entries: () => [entry] })
}
