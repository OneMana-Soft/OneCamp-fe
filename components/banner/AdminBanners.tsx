"use client"

import { EmailOffBanner } from "@/components/banner/EmailOffBanner"
import { DiskBanner } from "@/components/banner/DiskBanner"

// The banners only a workspace's admins see: email that can't go out, then a
// filling disk. One component for the phone and the computer layouts, so a
// banner added here reaches both. The disk warning once went into the phone
// layout twice and the computer layout not at all.
export function AdminBanners({ isAdmin }: { isAdmin?: boolean }) {
  return (
    <>
      <EmailOffBanner isAdmin={isAdmin} />
      <DiskBanner isAdmin={isAdmin} />
    </>
  )
}
