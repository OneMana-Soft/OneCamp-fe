"use client"

// /connect/authorize: where a person approves an outside agent signing in to
// this workspace. See components/connect/ConnectAuthorize.

import { Suspense } from "react"
import { LoaderCircle } from "@/lib/icons"
import { ThemeToggle } from "@/components/themeProvider/theme-toggle"
import { ConnectAuthorize } from "@/components/connect/ConnectAuthorize"

export default function ConnectAuthorizePage() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12 text-foreground">
      <div className="absolute right-4 top-4 md:right-8 md:top-8">
        <ThemeToggle />
      </div>
      <img src="/logo.svg" alt="OneCamp" width={40} height={40} className="mb-8 h-10 w-10" />
      <div className="w-full max-w-md">
        <Suspense
          fallback={
            <div className="flex justify-center">
              <LoaderCircle className="h-6 w-6 animate-spin" />
            </div>
          }
        >
          <ConnectAuthorize />
        </Suspense>
      </div>
    </main>
  )
}
