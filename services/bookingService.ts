// Booking pages, public side: anyone may look at a page's free slots, book
// one, and cancel through their link. Plain fetch, so the signed-in axios
// instance (refresh, CSRF, logout) is never involved, as with guest links.

import type { Slot } from "@/lib/calendar/availability"

import { publicCall } from "@/services/publicApi"

export interface PublicBookingPage {
  slug: string
  title: string
  description: string
  duration_minutes: number
  owner_name: string
  owner_tz: string
  slots: Slot[]
  bookable_until: string
}

export interface Booked {
  title: string
  owner_name: string
  start: string
  end: string
  cancel_token: string
  emailed: boolean
}

export interface BookingView {
  title: string
  owner_name: string
  start: string
  end: string
  cancelled: boolean
  slug: string
}

export const getBookingPage = (slug: string, from: Date, to: Date) =>
  publicCall<PublicBookingPage>(`/public/book/${encodeURIComponent(slug)}?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`)

export const bookSlot = (slug: string, body: { start: string; name: string; email: string; note: string; tz: string; website: string }) =>
  publicCall<Booked>(`/public/book/${encodeURIComponent(slug)}`, { method: "POST", body: JSON.stringify(body) })

export const getBooking = (token: string) => publicCall<BookingView>(`/public/booking/${encodeURIComponent(token)}`)

export const cancelBooking = (token: string) =>
  publicCall<BookingView>(`/public/booking/${encodeURIComponent(token)}/cancel`, { method: "POST" })

export const bookingPageUrl = (slug: string) => (typeof window === "undefined" ? `/book/${slug}` : `${window.location.origin}/book/${slug}`)
