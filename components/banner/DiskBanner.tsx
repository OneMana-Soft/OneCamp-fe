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
import { AlertTriangle, X } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { useFetch } from "@/hooks/useFetch"
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
  const { data } = useFetch<{ data: DiskInfo }>(isAdmin ? GetEndpointUrl.GetAdminDisk : "", undefined, {
    refreshInterval: 10 * 60 * 1000,
    revalidateOnFocus: false,
  })
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
    <div
      role={critical ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2 border-b px-4 py-2 text-xs",
        critical ? "border-destructive/30 bg-destructive/10 text-danger-ink" : "border-warning/30 bg-warning/10 text-warning-ink",
      )}
    >
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <p className="flex-1">
        The server&apos;s disk is {disk.used_pct}% full ({formatBytesShort(disk.free_bytes ?? 0)} free).{" "}
        {critical ? "Near full, the database stops saving anything. Free room now: " : "Free some room before it fills: "}
        remove old files with &ldquo;Remove for good&rdquo; in{" "}
        <Link href="/app/admin?tab=archive" className="font-medium underline underline-offset-2">
          Admin, Archive
        </Link>
        , and if you host OneCamp yourself, run <code className="font-mono">make housekeeping</code> on the server.
      </p>
      {!critical && (
        <button onClick={dismiss} aria-label="Dismiss for a day" className="shrink-0 rounded p-0.5 hover:bg-warning/20">
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
