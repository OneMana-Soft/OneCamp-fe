// Booking pages, public side: anyone may look at a page's free slots, book
// one, and cancel through their link. Plain fetch, so the signed-in axios
// instance (refresh, CSRF, logout) is never involved, as with guest links.

import type { Slot } from "@/lib/calendar/availability"

const backendBase = (process.env.NEXT_PUBLIC_BACKEND_URL || "").replace(/\/$/, "")

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

type Result<T> = { ok: true; data: T } | { ok: false; status: number; msg: string }

async function call<T>(path: string, init?: RequestInit): Promise<Result<T>> {
  try {
    const res = await fetch(backendBase + path, {
      ...init,
      headers: { Accept: "application/json", ...(init?.body ? { "Content-Type": "application/json" } : {}) },
    })
    const body = await res.json().catch(() => ({}))
    if (res.ok) return { ok: true, data: (body as { data: T }).data }
    return { ok: false, status: res.status, msg: (body as { msg?: string }).msg || "Something went wrong. Try again." }
  } catch {
    return { ok: false, status: 0, msg: "Couldn't reach the server. Check your connection and try again." }
  }
}

export const getBookingPage = (slug: string, from: Date, to: Date) =>
  call<PublicBookingPage>(`/public/book/${encodeURIComponent(slug)}?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`)

export const bookSlot = (slug: string, body: { start: string; name: string; email: string; note: string; tz: string; website: string }) =>
  call<Booked>(`/public/book/${encodeURIComponent(slug)}`, { method: "POST", body: JSON.stringify(body) })

export const getBooking = (token: string) => call<BookingView>(`/public/booking/${encodeURIComponent(token)}`)

export const cancelBooking = (token: string) =>
  call<BookingView>(`/public/booking/${encodeURIComponent(token)}/cancel`, { method: "POST" })

export const bookingPageUrl = (slug: string) => (typeof window === "undefined" ? `/book/${slug}` : `${window.location.origin}/book/${slug}`)
