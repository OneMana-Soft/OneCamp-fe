/**
 * The workspace's name, from one place (design review PG1-01, 14 Oct 2026).
 * It was read raw from the build's NEXT_PUBLIC_ORG_NAME in fourteen places,
 * some trimmed and some not, each with a fallback of its own; on the demo it
 * said "one camp" at the top of every page, on the sign-in page and on the
 * boot screen. Fixing the name is the owner's (the build's environment); this
 * makes it one source.
 *
 * A page that has the server's name for its workspace passes it, and it
 * comes first: a guest page's answer carries `workspace_name`, and every other
 * page reads the sign-in answer's through hooks/useWorkspaceName. Pure apart
 * from the build's environment.
 */

/**
 * Where this browser keeps the last name the server gave
 * (hooks/useWorkspaceName), so the boot screen (lib/appBoot) can show it
 * before any code has run, and the next open before the server answers.
 */
export const WORKSPACE_NAME_STORE_KEY = "onecamp-workspace-name"

/** The most of a stored name the boot screen shows, as the server caps it. */
export const WORKSPACE_NAME_MAX = 80

/** The workspace's own name: the server's, else the build's; "" when it has none. */
export function namedWorkspace(fromServer?: string | null): string {
  return fromServer?.trim() || process.env.NEXT_PUBLIC_ORG_NAME?.trim() || ""
}

/** What to call the workspace when it must be called something: its name, or OneCamp. */
export function workspaceName(fromServer?: string | null): string {
  return namedWorkspace(fromServer) || "OneCamp"
}
