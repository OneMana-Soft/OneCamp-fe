/** A month as the calendar view shows it: its first day, at midnight. */
export const monthOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1)
