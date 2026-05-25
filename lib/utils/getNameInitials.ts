// Returns up to two uppercase initials for a display name.
//
// Robust to null/undefined/empty/whitespace-only inputs: splitting
// "   " on /\s+/ would otherwise yield [""] and crash on `[0][0]`.
// We normalise once and bail out cleanly if there's nothing usable.
export const getNameInitials = (userName: string | undefined | null): string => {
    if (!userName) return ""

    const parts = userName.trim().split(/\s+/).filter(Boolean)
    if (parts.length === 0) return ""

    const firstInitial = (parts[0]?.[0] ?? "").toUpperCase()
    const lastInitial =
        parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "").toUpperCase() : ""

    return firstInitial + lastInitial
}
