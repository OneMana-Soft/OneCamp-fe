"use client"

import React, { Component, ErrorInfo, ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { AlertCircle, RotateCcw } from "@/lib/icons";

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

  private handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
          return this.props.fallback
      }

      return (
        <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-background text-foreground">
          <div className="flex flex-col items-center max-w-md text-center">
            <div className="p-4 mb-4 rounded-full bg-destructive/10">
              <AlertCircle className="w-12 h-12 text-destructive" />
            </div>
            <h1 className="mb-2 text-2xl font-bold tracking-tight">Something went wrong</h1>
            <p className="mb-6 text-muted-foreground">
              An unexpected error occurred. We've been notified and are looking into it.
            </p>
            {process.env.NODE_ENV === "development" && (
              <div className="w-full p-4 mb-6 overflow-auto text-left rounded-lg bg-muted max-h-48">
                <p className="mb-2 font-mono text-xs font-bold text-destructive">
                  {this.state.error?.name}: {this.state.error?.message}
                </p>
                <p className="font-mono text-[10px] text-muted-foreground whitespace-pre">
                  {this.state.error?.stack}
                </p>
              </div>
            )}
            <div className="flex gap-4">
              <Button onClick={() => window.location.reload()} variant="outline" className="gap-2">
                <RotateCcw className="w-4 h-4" />
                Reload page
              </Button>
              <Button onClick={this.handleReset}>
                Try again
              </Button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
