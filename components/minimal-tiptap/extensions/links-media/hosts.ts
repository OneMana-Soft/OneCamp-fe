/**
 * Small state the doc's links and media share across their chunks: the hosts
 * an admin added for embeds (GET /unfurl/embeds, read by the overlay), and
 * whether the next empty bookmark or embed drawn takes the focus (one this
 * tab just made from "/", never a collaborator's).
 */

let adminHosts: string[] = []
export const setAdminHosts = (hosts: string[]) => {
  adminHosts = hosts
}
export const adminHostsNow = () => adminHosts

let focusNext = false
export const requestLinkFocus = () => {
  focusNext = true
}
/** Whether this field takes the focus; asking clears it. */
export const takeLinkFocus = () => {
  const f = focusNext
  focusNext = false
  return f
}
