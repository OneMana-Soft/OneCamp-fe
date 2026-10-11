"use client"

// /connect/authorize: where a person approves an outside agent signing in to
// this workspace. See components/connect/ConnectAuthorize.
//
// In the frame the other signed-out pages share, centred, with the consent
// card (440px) on the canvas glow at half strength (design v3, admin.md F9).

import { Suspense } from "react"
import { AuthShell } from "@/components/auth/AuthShell"
import { ConnectAuthorize, ConnectAuthorizeLoading } from "@/components/connect/ConnectAuthorize"

export default function ConnectAuthorizePage() {
  return (
    <AuthShell className="max-w-[440px]">
      <Suspense fallback={<ConnectAuthorizeLoading />}>
        <ConnectAuthorize />
      </Suspense>
    </AuthShell>
  )
}
