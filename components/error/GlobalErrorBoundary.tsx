"use client"

import { Component, ErrorInfo, ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { SpotError } from "@/components/ui/graphics/spots"

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class GlobalErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo)
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
          return this.props.fallback
      }

      // The last resort, for a crash in the app's frame itself (a crash inside
      // a page is caught inside the frame by app/app/error.tsx). It used to
      // say "We've been notified and are looking into it": nothing reports
      // errors anywhere, and on a server the customer runs there is nobody to
      // tell. It says what is true, and the one way on that works: reloading.
      return (
        <div role="alert" className="flex min-h-dvh flex-col items-center justify-center bg-background p-6 text-foreground">
          <EmptyState
            tone="accent"
            headingLevel={1}
            illustration={<SpotError />}
            title="OneCamp hit a problem it couldn't recover from"
            description="Nothing you saved is lost. Reload the page to carry on."
            action={<Button onClick={() => window.location.reload()}>Reload page</Button>}
          />
          {process.env.NODE_ENV === "development" && (
            <div className="mt-6 max-h-48 w-full max-w-xl overflow-auto rounded-lg bg-muted p-4 text-left">
              <p className="mb-2 font-mono text-xs font-bold text-danger-ink">
                {this.state.error?.name}: {this.state.error?.message}
              </p>
              <p className="whitespace-pre font-mono text-2xs text-muted-foreground">{this.state.error?.stack}</p>
            </div>
          )}
        </div>
      )
    }

    return this.props.children
  }
}
