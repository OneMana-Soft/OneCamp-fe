"use client"

import { useEffect } from "react"
import Link from "next/link"
import { AlertCircle } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"

/**
 * A page inside the app that crashes, caught inside the app's frame.
 *
 * There was no route-level error page, so a crash in any page reached the
 * boundary around the whole app (components/error/GlobalErrorBoundary), which
 * drew over the sidebar and the top bar: one broken page took the way to every
 * other page with it. Next renders this in the page's place, inside the
 * layout, so the sidebar stays and the person can go elsewhere.
 */
export default function AppRouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <main id="main-content" className="flex h-full min-h-0 flex-1 flex-col items-center justify-center px-4 py-16">
      <EmptyState
        tone="accent"
        headingLevel={1}
        icon={AlertCircle}
        title="This page hit a problem"
        description="Nothing you saved is lost, and the rest of OneCamp still works. Try the page again, or go back to Home."
        action={
          <div className="flex flex-col items-center gap-3">
            <Button onClick={reset}>Try again</Button>
            <Link href="/app/home" className="text-sm text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 rounded-sm">
              Go to Home
            </Link>
          </div>
        }
      />
      {process.env.NODE_ENV === "development" && (
        <pre className="mt-6 max-h-48 w-full max-w-xl overflow-auto rounded-lg bg-muted p-3 font-mono text-2xs text-muted-foreground">
          {error.name}: {error.message}
        </pre>
      )}
    </main>
  )
}
