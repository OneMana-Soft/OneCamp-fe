"use client"

import { EmailOffBanner } from "@/components/banner/EmailOffBanner"
import { DiskBanner } from "@/components/banner/DiskBanner"
import { ImportOutcomeBanner } from "@/components/banner/ImportOutcomeBanner"
import { MembersEditNotice } from "@/components/banner/MembersEditNotice"

// The banners for the people who run things: email that can't go out, a
// filling disk, how their own imports ended (a workspace's admins), and the
// one-time news that members now change tasks (the admins of its projects
// too, so the server decides whom that one is for). One component for the
// phone and the computer layouts, so a banner added here reaches both. The
// disk warning once went into the phone layout twice and the computer layout
// not at all.
export function AdminBanners({ isAdmin }: { isAdmin?: boolean }) {
  return (
    <>
      <EmailOffBanner isAdmin={isAdmin} />
      <DiskBanner isAdmin={isAdmin} />
      <ImportOutcomeBanner isAdmin={isAdmin} />
      <MembersEditNotice />
    </>
  )
}
