/** Leaves the app for url (a provider's sign-in page), which brings the admin back. A module so tests can stand in for it. */
export function leaveTo(url: string): void {
  window.location.assign(url)
}
