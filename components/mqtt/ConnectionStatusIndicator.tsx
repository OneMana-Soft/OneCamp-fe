"use client"

import React from "react"
import { useMqtt } from "@/components/mqtt/mqttProvider"
import { cn } from "@/lib/utils/helpers/cn"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

interface ConnectionStatusIndicatorProps {
  compact?: boolean
}

export function ConnectionStatusIndicator({ compact = false }: ConnectionStatusIndicatorProps) {
  const { connectionState } = useMqtt()
  const { isConnected, isConnecting, error } = connectionState

  let statusColor = "bg-destructive shadow-[0_0_8px_rgba(239,68,68,0.5)]"
  let statusText = "Offline"

  if (isConnected) {
    statusColor = "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)]"
    statusText = "Connected"
  } else if (isConnecting) {
    statusColor = "bg-amber-500 animate-pulse shadow-[0_0_8px_rgba(245,158,11,0.5)]"
    statusText = "Connecting..."
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn(
            "flex items-center rounded-md transition-colors cursor-help",
            compact
              ? "h-9 w-9 justify-center hover:bg-accent"
              : "gap-2 px-2 py-1 hover:bg-muted"
          )}>
            <div className="relative flex h-2 w-2">
              {isConnected && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              )}
              <div className={cn("relative inline-flex rounded-full h-2 w-2", statusColor)} />
            </div>
            {!compact && (
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider hidden md:block">
                {isConnected ? "Live" : statusText}
              </span>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          <p className="font-semibold">{statusText}</p>
          {error && <p className="text-primary-foreground/90 mt-1 max-w-[200px] break-words">{error}</p>}
          <p className="text-primary-foreground/70 mt-1 text-[10px]">Real-time connection status</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
