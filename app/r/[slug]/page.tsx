"use client"

import { use } from "react"

import { RoomDoorway } from "@/components/guest/RoomDoorway"

/**
 * A member's personal meeting room (calls CALLS-2), at the address they
 * share: anyone outside the workspace comes in here, with its passcode when
 * it has one, and waits in its lobby to be let in. It is a visitor's page
 * (lib/axiosInstance onVisitorPage): nothing here signs anyone out.
 */
export default function RoomPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  return <RoomDoorway slug={slug} />
}
