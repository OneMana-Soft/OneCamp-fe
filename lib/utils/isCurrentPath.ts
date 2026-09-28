/**
 * Whether a link points at the page being viewed. Query, hash and a trailing
 * slash are ignored, so "/app/doc/x?tab=history" is still the doc you are on.
 *
 * Written once because the sidebar's Recent list compared "/app/channel/x"
 * with "app/channel/x" (one side had lost its leading slash) and so never
 * marked the page you were on, while every other group did.
 */
export function isCurrentPath(pathname: string, target: string): boolean {
  const norm = (p: string) => {
    const bare = p.split(/[?#]/)[0].trim()
    const withSlash = bare.startsWith("/") ? bare : `/${bare}`
    return withSlash.length > 1 ? withSlash.replace(/\/+$/, "") : withSlash
  }
  if (!pathname || !target) return false
  return norm(pathname) === norm(target)
}
