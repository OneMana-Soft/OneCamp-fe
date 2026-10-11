/**
 * A health's colour as a band or a rail dot (design v3, work.md W27): moss on
 * track, sun at risk, danger off track, ink for the rest. Always beside the
 * health's word, never alone.
 */
export function healthColor(health: string | null | undefined): string {
  switch (health) {
    case "on_track":
    case "achieved":
      return "var(--camp-moss)"
    case "at_risk":
      return "var(--camp-sun)"
    case "off_track":
    case "missed":
      return "var(--destructive)"
    case "done":
      return "var(--camp-sky)"
    default:
      return "var(--ink-3)"
  }
}
