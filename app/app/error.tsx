"use client"

import { useEffect } from "react"
import { CrashState, crashDetails } from "@/components/error/CrashState"

/**
 * A page inside the app that crashes, caught inside the app's frame.
 *
 * There was no route-level error page, so a crash in any page reached the
 * boundary around the whole app (components/error/GlobalErrorBoundary), which
 * drew over the sidebar: one broken page took the way to every other page
 * with it. Next renders this in the page's place, inside the layout, so the
 * sidebar stays and the person can go elsewhere.
 *
 * Design v3 (shell §L3): centred in the sheet, the crash spot, "Something broke
 * on this page", that the rest of OneCamp is fine with the error's reference,
 * Try again and Copy details. Development builds keep the message.
 */
export default function AppRouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <main id="main-content" className="flex h-full min-h-0 flex-1 flex-col items-center justify-center px-4 py-16">
      <CrashState title="Something broke on this page" digest={error.digest} onRetry={reset} details={() => crashDetails(error)}>
        {process.env.NODE_ENV === "development" && (
          <pre className="mt-6 max-h-48 w-full max-w-xl overflow-auto rounded-lg bg-sunken p-3 text-left font-mono text-2xs text-ink-2">
            {error.name}: {error.message}
          </pre>
        )}
      </CrashState>
    </main>
  )
}
