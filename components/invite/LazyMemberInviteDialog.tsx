"use client"

import { lazyDialog } from "@/lib/lazy/lazyDialog"

// Every signed-in screen holds the invite form (the profile sheet, the command host): it loads when it opens.
export const LazyMemberInviteDialog = lazyDialog(
  () => import("@/components/invite/MemberInviteDialog").then((m) => m.MemberInviteDialog),
  "the invite form",
)
