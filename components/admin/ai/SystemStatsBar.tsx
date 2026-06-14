"use client"

/**
 * SystemStatsBar — shows server headroom (disk, RAM, CPU) so an admin can
 * judge whether a local model will fit and run before installing it, plus
 * Ollama version awareness (update-available badge). OneCamp does NOT
 * auto-update Ollama; it surfaces the one-line command for the operator.
 */

import React from "react"
import { Badge } from "@/components/ui/badge"
import { RefreshCw, HardDrive, Cpu, MemoryStick, AlertTriangle } from "lucide-react"
import { SystemStats, formatBytes } from "@/services/aiModelService"

const Bar: React.FC<{ pct: number }> = ({ pct }) => {
  const clamped = Math.max(0, Math.min(100, pct))
  const color = clamped > 90 ? "bg-red-500" : clamped > 75 ? "bg-amber-500" : "bg-emerald-500"
  return (
    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
      <div className={`h-full ${color}`} style={{ width: `${clamped}%` }} />
    </div>
  )
}

export const SystemStatsBar: React.FC<{ stats: SystemStats; onRefresh: () => void }> = ({ stats, onRefresh }) => {
  return (
    <section className="rounded-lg border border-border bg-card/50 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Server resources</h3>
        <button
          type="button"
          onClick={onRefresh}
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
        >
          <RefreshCw className="h-3 w-3" /> refresh
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Disk */}
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <HardDrive className="h-3.5 w-3.5" /> Disk (model storage)
          </div>
          <Bar pct={stats.disk_used_percent} />
          <p className="text-xs">
            <span className="font-medium">{formatBytes(stats.disk_free_bytes)}</span> free
            <span className="text-muted-foreground"> of {formatBytes(stats.disk_total_bytes)}</span>
          </p>
        </div>

        {/* RAM */}
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <MemoryStick className="h-3.5 w-3.5" /> Memory
          </div>
          <Bar pct={stats.mem_used_percent} />
          <p className="text-xs">
            <span className="font-medium">{formatBytes(stats.mem_available_bytes)}</span> available
            <span className="text-muted-foreground"> of {formatBytes(stats.mem_total_bytes)}</span>
          </p>
        </div>

        {/* CPU */}
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Cpu className="h-3.5 w-3.5" /> CPU
          </div>
          <p className="text-xs">
            <span className="font-medium">{stats.cpu_count}</span> logical cores
          </p>
          {typeof stats.cpu_used_percent === "number" && stats.cpu_used_percent > 0 && (
            <p className="text-xs text-muted-foreground">{stats.cpu_used_percent.toFixed(0)}% in use</p>
          )}
        </div>
      </div>

      {/* Ollama version awareness */}
      {stats.ollama_version && (
        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
          <span className="text-muted-foreground">Ollama</span>
          <Badge variant="secondary">{stats.ollama_version}</Badge>
          {stats.ollama_update_available ? (
            <>
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="h-3 w-3" /> update available
                {stats.ollama_latest_version ? ` (${stats.ollama_latest_version})` : ""}
              </Badge>
              <code className="rounded bg-muted px-1.5 py-0.5">docker compose pull ollama && docker compose up -d ollama</code>
            </>
          ) : (
            <Badge variant="outline">up to date</Badge>
          )}
        </div>
      )}

      {stats.warnings && stats.warnings.length > 0 && (
        <p className="text-xs text-amber-600 dark:text-amber-500">
          {stats.warnings.join("; ")}
        </p>
      )}

      <p className="text-[11px] text-muted-foreground">
        Disk reading reflects the API container&apos;s filesystem; for split-disk setups set AI_DISK_PATH to the
        model volume for an exact figure.
      </p>
    </section>
  )
}
