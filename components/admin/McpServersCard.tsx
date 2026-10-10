"use client"

import { useId, useState } from "react"
import { Button } from "@/components/ui/button"
import { SettingsSection, sectionActionClass } from "@/components/ui/settingsSection"
import { StatusWord } from "@/components/ui/statusWord"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { useFetch } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import { useToast } from "@/hooks/use-toast"
import { useConfirm } from "@/hooks/useConfirm"
import { Plus, Trash2, Pencil, Plug, ExternalLink } from "@/lib/icons"
import {
  McpServer,
  McpCatalogEntry,
  parseMcpTools,
  setMcpServerEnabled,
  deleteMcpServer,
} from "@/services/mcpService"
import { McpServerEditDialog } from "./McpServerEditDialog"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { McpToolRiskBadge, McpToolRiskLegend } from "./McpToolRisk"
import { SectionListSkeleton } from "@/components/admin/SectionListSkeleton"
import { HUE_CLASS } from "@/components/ui/graphics/hues"
import { ADMIN_GROUP_HUE } from "@/components/admin/adminHues"
import { SpotPlug } from "@/components/ui/graphics"
import { hueFor } from "@/lib/campHue"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { cn } from "@/lib/utils/helpers/cn"

/**
 * The MCP servers agents can use, and the catalogue of checked connectors.
 *
 * A flat section, as every settings page and admin tab is: its title, one line
 * and a hairline list. It was a bordered Card with its own tile and h2, both on
 * the settings Agents page and inside the AI tab's Models section, where it
 * sat as a box in a box. `embedded` draws it as a section of a section there.
 */
const McpServersCard = ({ embedded = false }: { embedded?: boolean } = {}) => {
  const { data, isLoading, isError, mutate } = useFetch<{ data: McpServer[] }>(GetEndpointUrl.GetMcpServers)
  const { data: catalogData, mutate: mutateCatalog } = useFetch<{ data: McpCatalogEntry[] }>(
    GetEndpointUrl.GetMcpCatalog,
  )
  const { toast } = useToast()
  const confirm = useConfirm()
  const [editing, setEditing] = useState<McpServer | null>(null)
  const [creating, setCreating] = useState(false)
  const [prefill, setPrefill] = useState<McpCatalogEntry | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const servers = data?.data || []
  const catalog = catalogData?.data || []

  const handleToggle = async (s: McpServer, next: boolean) => {
    setBusyId(s.id)
    try {
      await setMcpServerEnabled(s.id, next)
      toast({ title: next ? `${s.name} is on` : `${s.name} is off` })
      mutate()
    } catch {
      // interceptor surfaces the error
    } finally {
      setBusyId(null)
    }
  }

  const handleDelete = async (s: McpServer) => {
    confirm({
      title: `Remove the MCP server "${s.name}"?`,
      description: "Its tools are no longer available to agents. You can add it again later.",
      confirmText: "Remove server",
      destructive: true,
      onConfirm: async () => {
        setBusyId(s.id)
        try {
          await deleteMcpServer(s.id)
          toast({ title: `${s.name} removed` })
          mutate()
        } catch {
          // interceptor surfaces the error
        } finally {
          setBusyId(null)
        }
      },
    })
  }

  const catalogHeadingId = useId()
  const CatalogHeading = embedded ? "h4" : "h3"

  return (
    <SettingsSection
      level={embedded ? 3 : 2}
      title="MCP servers"
      description="Give your agents new tools from Model Context Protocol servers, from GitHub to your own internal services."
      action={
        // Outline: the page's one primary action is elsewhere (New agent in
        // your settings, Run the drill on the AI tab).
        <Button
          variant="outline"
          size="sm"
          className={sectionActionClass}
          onClick={() => {
            setPrefill(null)
            setCreating(true)
          }}
        >
          <Plus />
          Add server
        </Button>
      }
    >
        {isLoading ? (
          <SectionListSkeleton label="Loading MCP servers" rows={2} lines={3} trailing="switch" />
        ) : isError ? (
          <ErrorState
            compact
            subject="the MCP servers"
            detail={apiErrorMessage(isError, "Try again in a moment.")}
            onRetry={() => void mutate()}
          />
        ) : servers.length === 0 ? (
          // A first run, so the plug spot; inside the list's own box, where
          // the servers will appear.
          <div className="rounded-lg border border-border">
            <EmptyState
              icon={Plug}
              hue={ADMIN_GROUP_HUE.ai}
              illustration={<SpotPlug hue={ADMIN_GROUP_HUE.ai} />}
              title="No MCP servers yet"
              description="Add a server to bring its tools to your agents, or install one from the catalogue below."
              headingLevel={embedded ? 4 : 3}
              className="py-6"
            />
          </div>
        ) : (
          <div className="space-y-3">
            {/* Read once for the whole list: every tool chip below is labelled
                with the risk OneCamp enforces for it. */}
            <McpToolRiskLegend />
            {/* One hairline list of rows, where each server was a card. */}
            <ul className="divide-y divide-border rounded-lg border border-border">
            {servers.map((s) => {
              const tools = parseMcpTools(s)
              return (
                <li key={s.id} className="flex items-start justify-between gap-4 px-4 py-3">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="truncate text-sm font-medium">{s.name}</span>
                      {!s.enabled && <StatusWord className="text-xs">Turned off</StatusWord>}
                      {s.auth_secret_unreadable ? (
                        <StatusWord tone="danger" className="text-xs">Secret unreadable</StatusWord>
                      ) : s.last_error ? (
                        <StatusWord tone="danger" className="text-xs">Can&apos;t connect</StatusWord>
                      ) : (
                        <span className="text-xs text-muted-foreground">{tools.length} {tools.length === 1 ? "tool" : "tools"}</span>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{s.url}</p>
                    {tools.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        {tools.slice(0, 6).map((t) => (
                          <Badge key={t.name} variant="outline" className="gap-1 text-2xs font-normal">
                            {t.name}
                            <McpToolRiskBadge tool={t} compact />
                          </Badge>
                        ))}
                        {tools.length > 6 && <span className="text-2xs text-muted-foreground">+{tools.length - 6} more</span>}
                      </div>
                    )}
                    {/* Said here because this is where somebody is sent to fix it. The
                        server looks healthy in every other respect: it is enabled, it has
                        a URL, and its tool list is the one it last reported. It is
                        contributing none of them. */}
                    {s.auth_secret_unreadable && (
                      <p className="text-xs text-danger-ink">
                        Its saved secret can&apos;t be read, so it gives agents no tools. This usually means the
                        AI_CONFIG_KEK setting changed: edit the server and enter the secret again.
                      </p>
                    )}
                    {s.last_error && <p className="text-xs text-danger-ink">{s.last_error}</p>}
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <Switch
                      checked={s.enabled}
                      disabled={busyId === s.id}
                      onCheckedChange={(v) => handleToggle(s, v)}
                      aria-label={`Use ${s.name}`}
                    />
                    <Button variant="ghost" size="icon" aria-label={`Edit ${s.name}`} className="h-8 w-8" onClick={() => setEditing(s)} title="Edit">
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove ${s.name}`}
                      className="h-8 w-8 text-danger-ink hover:text-danger-ink"
                      disabled={busyId === s.id}
                      onClick={() => handleDelete(s)}
                      title="Remove"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </li>
              )
            })}
            </ul>
          </div>
        )}

        {/* Connector catalog — vetted MCP servers an admin can install in a
            couple of clicks (prefills the add-server dialog). Self-hosted and
            vendor-neutral: each points at a server the operator runs. */}
        {catalog.length > 0 && (
          <section aria-labelledby={catalogHeadingId} className="space-y-3 pt-3">
            <div className="space-y-1">
              <CatalogHeading id={catalogHeadingId} className="text-sm font-medium">
                Connector catalogue
              </CatalogHeading>
              <p className="text-xs text-muted-foreground">
                Connectors we&apos;ve checked. Install one to fill in the setup, then paste your server&apos;s
                address and token.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {catalog.map((c) => (
                <div
                  key={c.slug}
                  className="flex items-start justify-between gap-3 rounded-lg border border-border/60 p-3 transition-colors hover:border-border"
                >
                  <div className="min-w-0 space-y-1">
                    {/* The name wraps rather than cutting: "Google Drive" was
                        "Google Dri…" beside its chip. */}
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-sm font-medium">{c.name}</span>
                      {/* A category is a thing with a colour: its camp hue's
                          tint and ink, fixed per category. */}
                      <span className={cn(HUE_CLASS[hueFor(c.category)], "whitespace-nowrap rounded-sm bg-hue-tint px-1.5 py-0.5 text-2xs font-medium text-hue-ink")}>
                        {c.category}
                      </span>
                    </div>
                    <p className="line-clamp-2 text-xs text-muted-foreground">{c.description}</p>
                    <a
                      href={c.docs_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      Setup guide <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </a>
                  </div>
                  {c.installed ? (
                    <StatusWord tone="success" className="shrink-0 text-xs">Installed</StatusWord>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={() => {
                        setPrefill(c)
                        setCreating(true)
                      }}
                    >
                      <Plus /> Install
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

      {(creating || editing) && (
        <McpServerEditDialog
          server={editing}
          prefill={prefill}
          open={creating || !!editing}
          onClose={() => {
            setCreating(false)
            setEditing(null)
            setPrefill(null)
          }}
          onSaved={() => {
            setCreating(false)
            setEditing(null)
            setPrefill(null)
            mutate()
            mutateCatalog()
          }}
        />
      )}
    </SettingsSection>
  )
}

export default McpServersCard
