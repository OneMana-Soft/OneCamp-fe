/**
 * Colour maps with a meaning: presence and status, and calendar event colours.
 *
 * There used to be a per-category palette here (DMs sky, channels emerald, docs
 * amber, tasks rose, AI violet...) that painted a tinted chip behind every icon
 * in every list. The icon already named the type, so the colour carried nothing,
 * and it was most of why the app looked like a template. Lists are monochrome
 * now (DESIGN.md, "Lists are rows, not cards"); do not bring it back.
 */

// ─── Status Colors ──────────────────────────────────────────

/**
 * Status colours, built from the four semantic tokens in app/globals.css rather
 * than raw Tailwind hues.
 *
 * This map already named the right four meanings, but spelled each one as a hue
 * plus a hand-written dark: variant — so it was a second source of truth alongside
 * every component that reached for `text-green-600` directly, and the two drifted
 * (this said emerald, half the components said green). Pointing it at the tokens
 * means the CSS variable is the only place a status colour is decided: retune
 * --success once and this map, every component using it, and every component using
 * the utility class all move together.
 *
 * The tokens are mode-aware, which is why the `dark:` halves are gone rather than
 * translated: --success is the 600 shade in light and the 400 in dark, exactly what
 * these pairs hand-wrote.
 */
export const statusColors = {
  /** Presence. The same positive green as success — it always was emerald. */
  online: {
    solid: "bg-success",
    text: "text-success",
    bg: "bg-success/10",
    border: "border-success/20",
    ring: "ring-success/20",
    ping: "bg-success/60",
  },
  success: {
    solid: "bg-success",
    text: "text-success",
    bg: "bg-success/10",
    bgLight: "bg-success/5",
    border: "border-success/20",
    borderLight: "border-success/30",
    ring: "ring-success/20",
  },
  error: {
    solid: "bg-destructive",
    text: "text-destructive",
    bg: "bg-destructive/10",
    border: "border-destructive/20",
  },
  warning: {
    solid: "bg-warning",
    text: "text-warning",
    bg: "bg-warning/10",
    border: "border-warning/20",
  },
  info: {
    solid: "bg-info",
    text: "text-info",
    bg: "bg-info/10",
    border: "border-info/20",
  },
} as const;

// ─── Calendar Colors ────────────────────────────────────────

// Tasks and events are a real category, so they differ: tasks take the accent
// (they are yours to do), events a neutral ink. As soft tinted blocks with the
// page's own text, not saturated blue and indigo bars with white text, which
// made the calendar the loudest and only cold screen in a warm, one-accent
// product. `solid` is for the small marks (a dot, an agenda bar).
export const calendarColors = {
  task: {
    solid: "bg-brand",
    block: "bg-brand/15 text-foreground",
    blockHover: "bg-brand/25 text-foreground",
    border: "border-brand/30",
    dot: "bg-brand/70",
  },
  event: {
    solid: "bg-foreground/55",
    block: "bg-foreground/[0.08] text-foreground",
    blockHover: "bg-foreground/[0.14] text-foreground",
    border: "border-foreground/15",
    dot: "bg-foreground/45",
  },
} as const;
