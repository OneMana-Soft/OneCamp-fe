import type { useToast } from "@/hooks/use-toast"

/**
 * Back from Google's consent screen: the server's connectors callback lands
 * on the calendar with ?connector=success|error (CAL-BUG-8). Said once, then
 * dropped from the address. A chunk of its own, since only a return from
 * Google needs it.
 */
export function sayGoogleReturn(status: () => unknown, events: () => unknown, toast: ReturnType<typeof useToast>["toast"]) {
  const params = new URLSearchParams(window.location.search)
  const said = params.get("connector")
  const provider = params.get("provider")
  if (!said || (provider && provider !== "google_calendar")) return
  if (said === "success") {
    void Promise.resolve(status()).then((res) => {
      const who = (res as { data?: { accountEmail?: string } } | undefined)?.data?.accountEmail
      toast({ title: "Google Calendar is connected", description: who ? `Connected as ${who}.` : "Its events show here now.", tone: "success" })
    })
    void events()
  } else if (said === "error") {
    toast({ title: "Couldn't connect Google Calendar", description: "The sign-in didn't finish. Try again from Calendars.", variant: "destructive" })
  }
  window.history.replaceState({}, document.title, window.location.pathname)
}
