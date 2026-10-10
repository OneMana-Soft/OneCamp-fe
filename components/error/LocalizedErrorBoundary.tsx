"use client"

import { Component, ErrorInfo, ReactNode } from "react";
import { RefreshCcw } from "@/lib/icons";
import { Button } from "@/components/ui/button";

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

  public static getDerivedStateFromError(_: Error): State {
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
      // One part of a page, said quietly in a hairline box like the lists
      // around it: a dashed red slab titled "Component crashed" was the loudest
      // thing on screen for a part a retry usually brings back.
      return (
        <div role="alert" className="flex min-h-[120px] flex-col items-center justify-center gap-2 rounded-lg border border-border px-4 py-6 text-center">
          <p className="text-sm font-medium text-foreground">{this.props.fallbackTitle || "This part of the page hit a problem"}</p>
          <p className="max-w-[40ch] text-xs text-muted-foreground">
            {this.props.fallbackDescription || "The rest of the page still works. Try this part again."}
          </p>
          <Button variant="outline" size="sm" className="mt-1 h-8 gap-1.5" onClick={this.handleReset}>
            <RefreshCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Try again
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
