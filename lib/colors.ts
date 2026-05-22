/**
 * Semantic color tokens for OneCamp categories.
 * Used consistently across mobile and desktop for visual scanning.
 * All colors use soft tints (bg-X/10 + text-X) for UI chrome.
 * Solid variants are reserved for badges, indicators, and urgency only.
 */

export interface CategoryColorSet {
  /** Background tint class, e.g. "bg-sky-500/10" */
  bg: string;
  /** Text/icon tint class, e.g. "text-sky-600" */
  text: string;
  /** Solid fill for badges / indicators, e.g. "bg-sky-500" */
  solid: string;
  /** Solid text on solid background, e.g. "text-white" */
  solidText: string;
}

export const categoryColors = {
  /** DMs / Direct Messages / Chat */
  chat: {
    bg: "bg-sky-500/10",
    text: "text-sky-600",
    solid: "bg-sky-500",
    solidText: "text-white",
  } satisfies CategoryColorSet,

  /** Channels / Discussions */
  channel: {
    bg: "bg-emerald-500/10",
    text: "text-emerald-600",
    solid: "bg-emerald-500",
    solidText: "text-white",
  } satisfies CategoryColorSet,

  /** Documents / Pages */
  doc: {
    bg: "bg-amber-500/10",
    text: "text-amber-600",
    solid: "bg-amber-500",
    solidText: "text-white",
  } satisfies CategoryColorSet,

  /** Tasks / Issues */
  task: {
    bg: "bg-rose-500/10",
    text: "text-rose-600",
    solid: "bg-rose-500",
    solidText: "text-white",
  } satisfies CategoryColorSet,

  /** AI Assistant */
  ai: {
    bg: "bg-violet-500/10",
    text: "text-violet-600",
    solid: "bg-violet-500",
    solidText: "text-white",
  } satisfies CategoryColorSet,

  /** Notifications / Activity */
  notification: {
    bg: "bg-primary/10",
    text: "text-primary",
    solid: "bg-primary",
    solidText: "text-primary-foreground",
  } satisfies CategoryColorSet,

  /** Teams / Groups */
  team: {
    bg: "bg-orange-500/10",
    text: "text-orange-600",
    solid: "bg-orange-500",
    solidText: "text-white",
  } satisfies CategoryColorSet,

  /** Projects */
  project: {
    bg: "bg-cyan-500/10",
    text: "text-cyan-600",
    solid: "bg-cyan-500",
    solidText: "text-white",
  } satisfies CategoryColorSet,

  /** Users / People */
  user: {
    bg: "bg-indigo-500/10",
    text: "text-indigo-600",
    solid: "bg-indigo-500",
    solidText: "text-white",
  } satisfies CategoryColorSet,

  /** Calendar / Events */
  calendar: {
    bg: "bg-teal-500/10",
    text: "text-teal-600",
    solid: "bg-teal-500",
    solidText: "text-white",
  } satisfies CategoryColorSet,

  /** Generic / Fallback */
  default: {
    bg: "bg-muted",
    text: "text-muted-foreground",
    solid: "bg-muted",
    solidText: "text-muted-foreground",
  } satisfies CategoryColorSet,
} as const;

export type CategoryKey = keyof typeof categoryColors;

/**
 * Get color set by type string (used for dynamic recent item mapping).
 */
export function getCategoryColor(type: string): CategoryColorSet {
  const map: Record<string, CategoryKey> = {
    chat: "chat",
    dm: "chat",
    message: "chat",
    channel: "channel",
    doc: "doc",
    document: "doc",
    task: "task",
    ai: "ai",
    notification: "notification",
    activity: "notification",
    team: "team",
    project: "project",
    user: "user",
    calendar: "calendar",
    event: "calendar",
  };
  const key = map[type.toLowerCase()];
  return key ? categoryColors[key] : categoryColors.default;
}

// ─── Status Colors ──────────────────────────────────────────

export const statusColors = {
  online: {
    solid: "bg-emerald-500",
    text: "text-emerald-500",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
    ring: "ring-emerald-500/20",
    ping: "bg-emerald-400",
  },
  success: {
    solid: "bg-emerald-500",
    // Lighter shade in dark mode so the text reads against bg-emerald-500/10
    text: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-500/10",
    bgLight: "bg-emerald-500/5",
    border: "border-emerald-500/20",
    borderLight: "border-emerald-500/30",
    ring: "ring-emerald-500/20",
  },
  error: {
    solid: "bg-red-500",
    text: "text-red-600 dark:text-red-400",
    bg: "bg-red-500/10",
    border: "border-red-500/20",
  },
  warning: {
    solid: "bg-amber-500",
    text: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
  },
  info: {
    solid: "bg-blue-500",
    text: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/20",
  },
} as const;

// ─── Calendar Colors ────────────────────────────────────────

export const calendarColors = {
  task: {
    solid: "bg-blue-500",
    solidHover: "bg-blue-600",
    solidOpacity: "bg-blue-500/90",
    text: "text-blue-500",
    bg: "bg-blue-500/10",
    border: "border-blue-300/20",
    dot: "bg-blue-500/60",
  },
  event: {
    solid: "bg-indigo-500",
    solidHover: "bg-indigo-600",
    solidOpacity: "bg-indigo-500/90",
    text: "text-indigo-500",
    bg: "bg-indigo-500/10",
    border: "border-indigo-300/20",
    dot: "bg-indigo-500/60",
  },
} as const;
