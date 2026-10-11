"use client"

import { Component, ErrorInfo, ReactNode } from "react";
import { AlertCircle } from "@/lib/icons";

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  fallbackDescription?: string;
}

interface State {
  hasError: boolean;
}

export class LocalizedErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[Localized Error Boundary] caught an error:", error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false });
  };

  public render() {
    if (this.state.hasError) {
      // One part of a page, said in one quiet row (design v3, shell §L3):
      // an alert glyph, what happened, and Try again as a link. A dashed red
      // slab titled "Component crashed" was the loudest thing on screen for a
      // part a retry usually brings back.
      return (
        <div role="alert" data-localized-error="" className="flex min-h-10 flex-wrap items-center gap-x-2 gap-y-1 rounded-md px-3 py-2 text-sm text-ink-2">
          <AlertCircle className="size-4 shrink-0 text-ink-3" aria-hidden="true" />
          <span>{this.props.fallbackTitle || "Couldn't show this"}</span>
          {this.props.fallbackDescription && <span className="text-xs text-ink-3">{this.props.fallbackDescription}</span>}
          <button
            type="button"
            onClick={this.handleReset}
            className="rounded-sm font-medium text-brand-text underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
