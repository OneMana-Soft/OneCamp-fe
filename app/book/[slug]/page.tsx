"use client"

import { use } from "react"

import { BookingFlow } from "@/components/booking/BookingFlow"

/** A public booking page: the flow in components/booking/BookingFlow (content.md K01 to K06). */
export default function BookingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  return <BookingFlow slug={slug} />
}
