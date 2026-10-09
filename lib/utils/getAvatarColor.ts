/**
 * The avatar fallback: initials in text-2 on a neutral ground (surface-3).
 *
 * It was a name-hashed pastel from ten hues (Notion's way), so every message
 * row carried a purple SR, a peach MC and a beige JW. A photo carries identity;
 * initials only stand in for one, and the colours added noise to every row
 * without telling anyone apart that the name beside them did not. Agents keep
 * their own tint, set where an agent's avatar is drawn.
 *
 * The seed is still taken so callers need not change, and so a palette can
 * come back in one place if one is ever wanted.
 */
export function getAvatarFallbackClass(_seed?: string | undefined | null): string {
    return "bg-sidebar-accent text-muted-foreground font-medium"
}
