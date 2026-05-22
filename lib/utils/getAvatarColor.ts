/**
 * Stable, name-hashed avatar fallback color.
 *
 * Notion uses a small palette of muted tints for avatars when no image is set,
 * keyed off the user's name so the same person always gets the same color
 * across renders. We do the same here using soft Tailwind tints from our
 * existing semantic palette so dark mode adapts automatically.
 *
 * Returns Tailwind classes for `bg` + `text` to apply to `AvatarFallback`.
 */

const PALETTE: { bg: string; text: string }[] = [
    { bg: "bg-sky-500/15", text: "text-sky-700 dark:text-sky-300" },
    { bg: "bg-emerald-500/15", text: "text-emerald-700 dark:text-emerald-300" },
    { bg: "bg-amber-500/15", text: "text-amber-700 dark:text-amber-300" },
    { bg: "bg-rose-500/15", text: "text-rose-700 dark:text-rose-300" },
    { bg: "bg-violet-500/15", text: "text-violet-700 dark:text-violet-300" },
    { bg: "bg-cyan-500/15", text: "text-cyan-700 dark:text-cyan-300" },
    { bg: "bg-orange-500/15", text: "text-orange-700 dark:text-orange-300" },
    { bg: "bg-indigo-500/15", text: "text-indigo-700 dark:text-indigo-300" },
    { bg: "bg-teal-500/15", text: "text-teal-700 dark:text-teal-300" },
    { bg: "bg-fuchsia-500/15", text: "text-fuchsia-700 dark:text-fuchsia-300" },
]

/** Cheap deterministic hash → palette index. */
function hashIndex(input: string, modulo: number): number {
    if (!input) return 0
    let h = 0
    for (let i = 0; i < input.length; i++) {
        h = (h << 5) - h + input.charCodeAt(i)
        h |= 0 // 32-bit
    }
    return Math.abs(h) % modulo
}

/**
 * Get a stable avatar fallback Tailwind classnames pair for a given seed
 * (typically the user's full name or UUID).
 */
export function getAvatarColor(seed: string | undefined | null): { bg: string; text: string } {
    if (!seed) return PALETTE[0]
    return PALETTE[hashIndex(seed, PALETTE.length)]
}

/** Combined Tailwind class string for the AvatarFallback `className`. */
export function getAvatarFallbackClass(seed: string | undefined | null): string {
    const c = getAvatarColor(seed)
    return `${c.bg} ${c.text} font-medium`
}
