"use client"

import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertCircle, RefreshCcw } from "@/lib/icons";
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
      return (
        <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-destructive/20 rounded-xl bg-destructive/5 text-center min-h-[120px]">
          <div className="flex items-center space-x-2 text-destructive mb-2">
            <AlertCircle className="h-5 w-5" />
            <span className="font-semibold text-sm">{this.props.fallbackTitle || "Component crashed"}</span>
          </div>
          <p className="text-xs text-muted-foreground mb-4 max-w-[200px]">
            {this.props.fallbackDescription || "Something went wrong in this section."}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={this.handleReset}
          >
            <RefreshCcw className="mr-2 h-3 w-3" />
            Try again
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
