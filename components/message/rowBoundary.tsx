"use client"

import { Component, type ErrorInfo, type ReactNode } from "react"
import { AlertCircle } from "@/lib/icons"
import { htmlToPreviewText } from "@/lib/utils/htmlToPreviewText"

interface Props {
    children: ReactNode
    /** The message as stored, offered as plain text when the row can't draw it. */
    raw?: string
}

interface State {
    failed: boolean
    showRaw: boolean
}

/**
 * Around each message row, in every conversation (design v3 chat, C34).
 *
 * One message that can't be drawn becomes a quiet 32px row of its own, and the
 * rest of the conversation stays: it used to take the whole channel down to
 * "This page hit a problem" (the read-only demo run of 11 Oct, a reaction
 * answer the row did not expect). DMs had a boundary round the body only, and
 * channels and groups had none.
 */
export class RowBoundary extends Component<Props, State> {
    public state: State = { failed: false, showRaw: false }

    public static getDerivedStateFromError(): Partial<State> {
        return { failed: true }
    }

    public componentDidCatch(error: Error, info: ErrorInfo) {
        console.error("[RowBoundary] a message could not be drawn:", error, info.componentStack)
    }

    public render() {
        if (!this.state.failed) return this.props.children
        const raw = this.props.raw ? htmlToPreviewText(this.props.raw) : ""
        return (
            <div role="alert" data-row-error="" className="grid grid-cols-[36px_minmax(0,1fr)] gap-x-3 py-1.5 pl-5 pr-6">
                <span className="flex h-8 items-center justify-center text-ink-3">
                    <AlertCircle className="size-4" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                    <div className="flex h-8 items-center gap-2 text-ui-sm text-ink-2">
                        <span>This message couldn&apos;t be shown</span>
                        {raw && !this.state.showRaw && (
                            <button
                                type="button"
                                onClick={() => this.setState({ showRaw: true })}
                                className="h-6 rounded-sm px-2 text-xs font-[510] text-ink-2 transition-colors hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                            >
                                Show raw
                            </button>
                        )}
                    </div>
                    {this.state.showRaw && <p className="whitespace-pre-wrap break-words pb-1 text-body text-ink-2">{raw}</p>}
                </div>
            </div>
        )
    }
}
