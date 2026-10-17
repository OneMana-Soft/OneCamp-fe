"use client"

import { useSyncExternalStore } from "react"
import useSWRImmutable from "swr/immutable"
import { signInAnswer } from "@/lib/auth/signInAnswer"
import { namedWorkspace, workspaceName, WORKSPACE_NAME_MAX, WORKSPACE_NAME_STORE_KEY } from "@/lib/workspaceName"

/**
 * The workspace's name on any page, signed in or not (design review PG1-01):
 * the server's (ORG_NAME), so a self-hosted workspace renamed there reads its
 * new name on the sign-in page, the boot screen and in the app without a
 * rebuild of the web app; else the build's; else OneCamp. Never re-cased.
 *
 * The server says it in GET /auth/providers, the sign-in page's own answer,
 * which needs no session: one answer for every page and for the sign-in
 * page's ways in, asked once per load (lib/auth/signInAnswer).
 * Until it answers, the name it gave last time in this browser, which the
 * boot screen (lib/appBoot) also shows before any code has run.
 */

/** The answer's own key: one request a load, whoever asks. */
const SERVER_NAME_KEY = "workspace-name:auth/providers"

/**
 * The server's name for its workspace: "" when nobody has named it; null when
 * there was no answer, or it came from a server that doesn't say (older than
 * this). Keeps what it hears for the next open.
 */
async function serverName(): Promise<string | null> {
  if (!process.env.NEXT_PUBLIC_BACKEND_URL) return null
  const name = (await signInAnswer())?.workspace_name
  if (typeof name !== "string") return null
  keep(name.trim().slice(0, WORKSPACE_NAME_MAX))
  return name
}

/** The last name the server gave, kept in this browser; "" when none is. */
function storedName(): string {
  try {
    return localStorage.getItem(WORKSPACE_NAME_STORE_KEY) ?? ""
  } catch {
    return ""
  }
}

function keep(name: string) {
  try {
    if (name) localStorage.setItem(WORKSPACE_NAME_STORE_KEY, name)
    else localStorage.removeItem(WORKSPACE_NAME_STORE_KEY)
  } catch {
    /* a browser that keeps nothing asks again next time */
  }
}

// The stored name changes only as the answer arrives, and from then the
// answer is what's read: nothing to listen to. A server render has none.
const unchanging = () => () => {}
const noneOnTheServer = () => ""

function useServerName(): string {
  const stored = useSyncExternalStore(unchanging, storedName, noneOnTheServer)
  const { data } = useSWRImmutable(SERVER_NAME_KEY, serverName)
  return typeof data === "string" ? data : stored
}

/** The workspace's name: the server's, else the build's, else OneCamp. */
export function useWorkspaceName(): string {
  return workspaceName(useServerName())
}

/** The same, "" when neither the server nor the build names it. */
export function useNamedWorkspace(): string {
  return namedWorkspace(useServerName())
}

/** The workspace's name, as text. */
export function WorkspaceName() {
  return <>{useWorkspaceName()}</>
}
