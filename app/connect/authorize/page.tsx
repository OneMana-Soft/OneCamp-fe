"use client"

// /connect/authorize: where a person approves an outside agent signing in to
// this workspace. See components/connect/ConnectAuthorize.
//
// In the frame the other signed-out pages share. It drew its own: a centred
// 40px logo, the theme switch floating in a corner, a centred heading.

import { Suspense } from "react"
import { AuthShell } from "@/components/auth/AuthShell"
import { ConnectAuthorize, ConnectAuthorizeLoading } from "@/components/connect/ConnectAuthorize"

export default function ConnectAuthorizePage() {
  return (
    <AuthShell>
      <Suspense fallback={<ConnectAuthorizeLoading />}>
        <ConnectAuthorize />
      </Suspense>
    </AuthShell>
  )
}
