// Keys another read just filled (the task panel's ?include=): a hook that
// mounts on one within 10 s shows it without asking again.
const seeded = new Map<string, number>()

export const markSeeded = (key: string) => void seeded.set(key, Date.now())

export const freshlySeeded = (key: string) => Date.now() - (seeded.get(key) ?? 0) < 10_000
