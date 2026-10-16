"use client"

import { adminEmbedHosts } from "@/services/unfurlService"
import { adminHostsNow, setAdminHosts } from "./hosts"

let asked: Promise<string[]> | null = null

/**
 * The hosts an admin added for embeds, read once a session, the first time an
 * embed or the paste menu needs them (never with the doc's first load). A read
 * that fails is an empty list, asked again next time.
 */
export function ensureAdminHosts(): Promise<string[]> {
  asked ??= adminEmbedHosts().then((hosts) => {
    if (hosts === null) asked = null
    else setAdminHosts(hosts)
    return adminHostsNow()
  })
  return asked.then(() => adminHostsNow())
}
