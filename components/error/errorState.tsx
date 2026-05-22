"use client"

import { AlertCircle } from "@/lib/icons";
import { Button } from "@/components/ui/button"

interface ErrorStateProps {
    onRetry?: () => void
    errorTitle: string
    errorMessage: string
}

export const ErrorState = ({ onRetry, errorMessage, errorTitle }: ErrorStateProps) => {
    return (
        <div className="h-full w-full flex flex-col items-center justify-center space-y-4">
            <AlertCircle className="h-12 w-12 text-destructive" />
            <div className="text-center">
                <h3 className="text-lg font-semibold">{errorTitle}</h3>
                <p className="text-sm text-muted-foreground">{errorMessage}</p>
            </div>
            {onRetry && (
                <Button onClick={onRetry} variant="outline">
                    Try Again
                </Button>
            )}
        </div>
    )
}
