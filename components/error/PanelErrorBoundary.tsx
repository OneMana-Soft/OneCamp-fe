"use client"

import { Component, type ErrorInfo, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { SpotError } from "@/components/ui/graphics/spots"
import { RefreshCcw, X } from "@/lib/icons"

interface Props {
  children: ReactNode
  /** What the panel shows; a new one starts clean (another task, another thread). */
  resetKey: string
  /** Closes the panel, from the error's own frame. */
  onClose?: () => void
  closeLabel?: string
}

/**
 * A side panel's or a split pane's crash, kept inside the panel.
 *
 * The right panel and the split panes live in the app's frame, not in a page,
 * so a crash in one (a task whose data came back in a shape it didn't expect)
 * went past the page's error screen to the boundary around the whole app, and
 * took the sidebar, the page and every other panel with it. Now the panel
 * says so in its own space, offers Try again and a way to close it, and the
 * rest of the app carries on. Showing something else in the panel starts over.
 */
export class PanelErrorBoundary extends Component<Props, { failedKey: string | null }> {
  public state = { failedKey: null as string | null }

  public static getDerivedStateFromError(): Partial<{ failedKey: string | null }> {
    return { failedKey: "__pending__" }
  }

  public componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[panel] crashed:", error, info)
    this.setState({ failedKey: this.props.resetKey })
  }

  private retry = () => this.setState({ failedKey: null })

  public render() {
    const { failedKey } = this.state
    // A crash belongs to what was shown when it happened.
    const failed = failedKey !== null && (failedKey === "__pending__" || failedKey === this.props.resetKey)
    if (!failed) return this.props.children
    return (
      <div role="alert" data-panel-error="" className="flex h-full min-h-[240px] flex-col items-start justify-center gap-3 px-6 py-10">
        <SpotError size={64} />
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">This panel hit a problem</p>
          <p className="max-w-[40ch] text-sm text-muted-foreground">The rest of OneCamp still works. Try the panel again, or close it.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={this.retry}>
            <RefreshCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Try again
          </Button>
          {this.props.onClose && (
            <Button variant="ghost" size="sm" className="h-8 gap-1.5" onClick={this.props.onClose}>
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              {this.props.closeLabel ?? "Close panel"}
            </Button>
          )}
        </div>
      </div>
    )
  }
}
