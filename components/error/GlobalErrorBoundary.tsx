"use client"

import { Component, ErrorInfo, ReactNode } from "react"
import { CrashState } from "@/components/error/CrashState"
import { SplashFrame } from "@/components/protectedRoute/Splash"

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
      // Design v3 (shell §L3): the crash's composition on the splash's frame
      // (the glow and the grain), with Reload page as its one way on.
      const error = this.state.error ?? new Error("Unknown error")
      return (
        <SplashFrame role="alert">
          <CrashState
            title="OneCamp hit a problem it couldn't recover from"
            line="Nothing you saved is lost. Reload the page to carry on."
            digest={(error as Error & { digest?: string }).digest}
            onRetry={() => window.location.reload()}
            retryLabel="Reload page"
          >
            {process.env.NODE_ENV === "development" && (
              <div className="mt-6 max-h-48 w-full max-w-xl overflow-auto rounded-lg bg-sunken p-4 text-left">
                <p className="mb-2 font-mono text-xs font-semibold text-danger-ink">
                  {error.name}: {error.message}
                </p>
                <p className="whitespace-pre font-mono text-2xs text-ink-2">{error.stack}</p>
              </div>
            )}
          </CrashState>
        </SplashFrame>
      )
    }

    return this.props.children
  }
}
