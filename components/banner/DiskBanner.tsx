"use client"

// Tells a workspace's admins that the server's disk is filling.
//
// WHY. A full disk stops the database accepting writes, and the workspace hangs
// rather than breaks, with nothing on screen to say why. A self-hosted server
// fills from Docker's leftovers as much as from uploads, and its admins are the
// only people who can do anything about either. So from 85% they are told,
// with what frees room. From 95% it cannot be dismissed.
//
// ADMINS ONLY: members can do nothing about it and would read it as the
// product being broken. Asked every ten minutes, never on focus.

import { useState } from "react"
import Link from "next/link"
import { NoticeBar } from "@/components/banner/NoticeBar"
import { useFetch } from "@/hooks/useFetch"
import { OWN_ERRORS } from "@/lib/axiosInstance"
import { GetEndpointUrl } from "@/services/endPoints"
import { formatBytesShort } from "@/lib/purgeLine"

interface DiskInfo {
  available: boolean
  used_pct?: number
  free_bytes?: number
  level?: "ok" | "warn" | "critical"
}

const DISMISSED_KEY = "onecamp:disk-banner-dismissed-at"
/** A dismissed warning comes back after a day: a disk does not empty itself. */
const SNOOZE_MS = 24 * 60 * 60 * 1000

const dismissedAt = () => {
  try {
    return Number(window.localStorage.getItem(DISMISSED_KEY)) || 0
  } catch {
    return 0
  }
}

export function DiskBanner({ isAdmin }: { isAdmin?: boolean }) {
  // A hint, asked for in the background every ten minutes: when it can't be
  // read there is no banner, and no toast about a request nobody made.
  const { data } = useFetch<{ data: DiskInfo }>(
    isAdmin ? GetEndpointUrl.GetAdminDisk : "",
    undefined,
    { refreshInterval: 10 * 60 * 1000, revalidateOnFocus: false },
    OWN_ERRORS,
  )
  const [snoozedAt, setSnoozedAt] = useState(() => (typeof window === "undefined" ? 0 : dismissedAt()))
  const disk = data?.data
  if (!isAdmin || !disk?.available || !disk.level || disk.level === "ok") return null
  const critical = disk.level === "critical"
  if (!critical && Date.now() - snoozedAt < SNOOZE_MS) return null

  const dismiss = () => {
    const now = Date.now()
    setSnoozedAt(now)
    try {
      window.localStorage.setItem(DISMISSED_KEY, String(now))
    } catch {
      /* dismissed for this visit only */
    }
  }

  return (
    <NoticeBar
      tone={critical ? "danger" : "warning"}
      role={critical ? "alert" : "status"}
      onDismiss={critical ? undefined : dismiss}
      dismissLabel="Dismiss for a day"
    >
      The server&apos;s disk is {disk.used_pct}% full ({formatBytesShort(disk.free_bytes ?? 0)} free).{" "}
      {critical ? "Near full, the database stops saving anything. Free room now: " : "Free some room before it fills: "}
      remove old files with &ldquo;Remove for good&rdquo; in{" "}
      <Link href="/app/admin?tab=archive" className="font-medium underline underline-offset-2 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70">
        Admin, Archive
      </Link>
      , and if you host OneCamp yourself, run <code className="font-mono">make housekeeping</code> on the server.
    </NoticeBar>
  )
}
