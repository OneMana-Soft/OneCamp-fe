/**
 * A page for someone outside the workspace, with no session: a guest link,
 * booking, form, RSVP, published page or unsubscribe. A 401 there is expected:
 * nothing refreshes or signs out (lib/axiosInstance), nor asks the config.
 */
export function onVisitorPage(pathname: string = typeof window !== 'undefined' ? window.location.pathname : ''): boolean {
    return /^\/(guest|book|booking|f|rsvp|p|r|unsubscribe)(\/|$)/.test(pathname);
}
