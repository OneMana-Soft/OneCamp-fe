// none 0 to urgent 4; free of i18n
const VALUES = ["", "low", "medium", "high", "urgent"]
export const PRIORITY_NAMES = ["No priority", "Low", "Medium", "High", "Urgent"] as const
export const priorityLevel = (value?: string | null) => Math.max(0, VALUES.indexOf(value || "")) as 0 | 1 | 2 | 3 | 4
