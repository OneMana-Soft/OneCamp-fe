/**
 * The one sentence on an archive policy card about permanent removal.
 *
 * Archiving hides; it keeps every byte. The purge is the owner's decision to
 * let archived files or recordings go for good after a number of days, and
 * the card has to say two things plainly: whether that is on, and what has
 * gone so far, because "cannot be undone" deserves a running total next to it.
 */
export type PurgeSummary = {
  entity_type: string
  purge_after_days?: number
  purged_count?: number
  purged_bytes?: number
}

/** Only these hold bytes a purge can free. Mirrors purgeSupported in the backend. */
export const PURGEABLE = ["attachments", "recordings"]

export function formatBytesShort(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

export function purgeLine(p: PurgeSummary): string {
  if (!PURGEABLE.includes(p.entity_type)) return ""
  const days = p.purge_after_days ?? 0
  const count = p.purged_count ?? 0
  const gone = count > 0 ? ` · ${count} removed so far (${formatBytesShort(p.purged_bytes ?? 0)})` : ""
  if (days <= 0) return `Kept after archiving${gone}`
  return `Removed for good ${days} days after archiving${gone}`
}
