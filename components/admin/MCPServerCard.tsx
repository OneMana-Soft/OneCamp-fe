"use client"

/**
 * MCPServerCard — the admin control for the governed MCP surface.
 *
 * WHAT AN ADMIN IS ACTUALLY DECIDING HERE. External AI clients (Claude, Cursor, a
 * custom agent) can connect to this workspace over MCP using a member's API token.
 * Until this screen existed, that was reachable by any token holding the right scope,
 * with no way for the person accountable for agent behaviour to say whether the door
 * was open. This is that decision.
 *
 * The two values save TOGETHER, matching the API, because they are one decision:
 * enabling the surface while nothing is selected exposes no tools, and selecting
 * groups without enabling looks like it took effect when nothing changed. So there is
 * one Save, disabled until something differs from what is stored — no "did that
 * apply?" ambiguity.
 *
 * THE GROUPS COME FROM THE SERVER, not from a list in here. A group a new tool
 * introduces appears without anyone remembering to add it, and a group with no tools
 * can never be offered. The same reason the audit log serves its own categories.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { Plug, ShieldAlert } from "@/lib/icons"
import { CopyableCode } from "@/components/ui/copyable-code"
import {
    MCP_TOKEN_PLACEHOLDER,
    mcpClientConfig,
    mcpCurlExample,
    mcpEndpointUrl,
} from "@/lib/utils/mcpEndpoint"
import { getAIMCPServer, setAIMCPServer, type MCPServerSettings } from "@/services/aiModelService"

/** The stored value meaning "every group, including ones added later". */
const ALL = "*"

/**
 * Human labels for the groups the server reports.
 *
 * A lookup rather than the source of truth: an unmapped group still renders, using its
 * raw name. Dropping a group we had no label for is exactly how a capability becomes
 * invisible in an admin screen, which is the bug this whole card exists to avoid.
 */
const GROUP_LABELS: Record<string, string> = {
    tasks: "Tasks",
    projects: "Projects & teams",
    docs: "Documents",
    messages: "Messages & conversations",
    tables: "Tables",
    search: "Workspace search",
    calendar: "Calendar & reminders",
    data_sources: "External data sources",
}

/**
 * What each group lets a connected agent reach, in the admin's terms.
 *
 * NAMES THE WRITES EXPLICITLY. A group contains both the read and the write tools for its
 * area, and several of these hints described only the reads — "Summarise channels and
 * conversations" for a group that also contains posting to channels and DMs. An admin
 * weighing whether to expose an area has to see the most consequential thing in it, and
 * posting into a channel is more consequential than reading one.
 *
 * A token still needs the matching `:write` scope to use those tools, so enabling a group
 * does not by itself grant writing. The hint says what the group CONTAINS; the sentence
 * under the group list says what still bounds it.
 */
const GROUP_HINTS: Record<string, string> = {
    tasks: "Read tasks, and change status, assignee and due dates — in projects the token's owner belongs to.",
    projects: "Read projects and teams that person is a member of, and create new projects.",
    docs: "Read documents that person can already open, and create new ones.",
    messages: "Summarise channels and conversations that person is in, and post messages, DMs and group messages as them.",
    tables: "Read and query tables visible to that person, and add or update rows.",
    search: "Search across everything that person can already see.",
    calendar: "Create reminders and events for that person.",
    data_sources: "Query external databases an admin has connected.",
}

function label(group: string): string {
    return GROUP_LABELS[group] ?? group
}

/** Parse the stored comma-separated list. Mirrors the server: blanks are not entries. */
function parseGroups(csv: string): string[] {
    return csv
        .split(",")
        .map((g) => g.trim().toLowerCase())
        .filter((g) => g !== "")
}

export function MCPServerCard() {
    const { toast } = useToast()
    const [stored, setStored] = useState<MCPServerSettings | undefined>()
    const [enabled, setEnabled] = useState(false)
    const [selected, setSelected] = useState<string[]>([])
    const [allGroups, setAllGroups] = useState(false)
    const [saving, setSaving] = useState(false)

    // Derived from the same base URL axios uses, so these cannot drift from the instance being
    // administered. Memoised only because they are strings rebuilt on every keystroke otherwise;
    // they depend on nothing that changes at runtime.
    const endpoint = useMemo(() => mcpEndpointUrl(), [])
    const clientConfig = useMemo(() => mcpClientConfig(), [])
    const curlExample = useMemo(() => mcpCurlExample(), [])

    // Self-contained, like every sibling admin card: it fetches its own state so the
    // settings page does not have to know this card exists beyond rendering it.
    const load = useCallback(async () => {
        try {
            setStored(await getAIMCPServer())
        } catch {
            // Leave the form on its defaults (off, nothing selected). A failed read must
            // not block the rest of the settings screen, and it must not render as
            // "enabled" — an admin has to be able to trust that a toggle shown as off
            // means the surface is closed.
        }
    }, [])

    useEffect(() => {
        void load()
    }, [load])

    // Re-sync whenever stored settings arrive, so the form starts from the truth rather
    // than from a stale first render.
    useEffect(() => {
        if (!stored) return
        const groups = parseGroups(stored.tool_groups)
        setEnabled(stored.enabled)
        setAllGroups(groups.includes(ALL))
        setSelected(groups.filter((g) => g !== ALL))
    }, [stored])

    const available = stored?.available_groups ?? []

    // What would be sent. Derived rather than tracked so the preview, the dirty check
    // and the save can never disagree about what is about to happen.
    const toolGroups = useMemo(
        () => (allGroups ? ALL : selected.join(",")),
        [allGroups, selected],
    )

    const dirty = useMemo(() => {
        if (!stored) return false
        const storedGroups = parseGroups(stored.tool_groups)
        const storedValue = storedGroups.includes(ALL) ? ALL : storedGroups.join(",")
        return enabled !== stored.enabled || toolGroups !== storedValue
    }, [stored, enabled, toolGroups])

    // Enabled with nothing selected exposes no tools. Said before they save rather than
    // left to be discovered from silence — the server refuses this too, but an admin
    // should not have to hit an error to learn it.
    const enabledButNothing = enabled && toolGroups === ""

    const toggleGroup = (group: string, on: boolean) => {
        setSelected((prev) => (on ? [...prev, group] : prev.filter((g) => g !== group)))
    }

    const handleSave = async () => {
        setSaving(true)
        try {
            await setAIMCPServer(enabled, toolGroups)
            toast({
                title: "Saved",
                description: enabled
                    ? "External agents can reach the groups you selected."
                    : "The MCP surface is closed to external agents.",
            })
            // Re-read rather than assume: the stored value is the truth this form must
            // show, and the server normalises what it was sent.
            await load()
        } catch (e) {
            toast({
                title: "Couldn't save",
                // The server names the valid groups when one is unrecognised, so its
                // message is more useful than anything written here.
                description: e instanceof Error ? e.message : "Failed to update the setting.",
                variant: "destructive",
            })
        } finally {
            setSaving(false)
        }
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Plug className="h-4 w-4 text-muted-foreground" />
                    External agent access (MCP)
                    {stored ? (
                        <Badge
                            variant="outline"
                            className={
                                stored.enabled
                                    ? "text-2xs bg-success/10 text-success border-success/20"
                                    : "text-2xs bg-muted text-muted-foreground border-border"
                            }
                        >
                            {stored.enabled ? "On" : "Off"}
                        </Badge>
                    ) : null}
                </CardTitle>
                <CardDescription>
                    Let outside AI clients — Claude, Cursor, your own agents — work in this
                    workspace over the Model Context Protocol. Every call runs as the person whose
                    API token it uses, so an agent can never reach something its owner
                    couldn&apos;t open themselves, and every call is recorded in the audit log
                    whether it succeeded or was refused. Most tools are additionally re-checked
                    against that person&apos;s live permission on the specific channel, document or
                    task before they run. Turning a group on here narrows what is reachable; it
                    never widens anyone&apos;s permissions.
                </CardDescription>
            </CardHeader>

            <CardContent className="space-y-5">
                <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                        <Label htmlFor="mcp-enabled" className="text-sm">
                            Allow external agents to connect
                        </Label>
                        <p className="text-xs text-muted-foreground">
                            Off by default. While this is off, the endpoint refuses every call
                            regardless of what any token allows.
                        </p>
                    </div>
                    <Switch
                        id="mcp-enabled"
                        checked={enabled}
                        onCheckedChange={setEnabled}
                        aria-describedby="mcp-enabled-hint"
                    />
                </div>
                <p id="mcp-enabled-hint" className="sr-only">
                    Controls whether the Model Context Protocol endpoint accepts calls from
                    external AI clients.
                </p>

                <fieldset className="space-y-3" disabled={!enabled}>
                    <legend className="text-sm font-medium">What agents can reach</legend>
                    <p className="text-xs text-muted-foreground">
                        Start with one group, watch the agent activity in the audit log, then widen.
                        Nothing is exposed until you choose at least one. A group covers both
                        reading and writing in that area — a token still needs the matching write
                        scope to change anything, so a read-only token stays read-only.
                    </p>

                    <div className="flex items-start gap-2.5 rounded-md border border-border/60 p-3">
                        <Checkbox
                            id="mcp-all"
                            checked={allGroups}
                            onCheckedChange={(v) => setAllGroups(v === true)}
                            disabled={!enabled}
                        />
                        <div className="space-y-0.5">
                            <Label htmlFor="mcp-all" className="text-sm">
                                Everything
                            </Label>
                            <p className="text-xs text-muted-foreground">
                                Including groups added by future updates, so you won&apos;t need to
                                revisit this screen.
                            </p>
                        </div>
                    </div>

                    {!allGroups && (
                        <div className="grid gap-2.5 sm:grid-cols-2">
                            {available.length === 0 ? (
                                <p className="text-xs text-muted-foreground sm:col-span-2">
                                    No tool groups are available in this build.
                                </p>
                            ) : (
                                available.map((group) => (
                                    <div key={group} className="flex items-start gap-2.5">
                                        <Checkbox
                                            id={`mcp-group-${group}`}
                                            checked={selected.includes(group)}
                                            onCheckedChange={(v) => toggleGroup(group, v === true)}
                                            disabled={!enabled}
                                        />
                                        <div className="space-y-0.5">
                                            <Label htmlFor={`mcp-group-${group}`} className="text-sm">
                                                {label(group)}
                                            </Label>
                                            {GROUP_HINTS[group] ? (
                                                <p className="text-xs text-muted-foreground">
                                                    {GROUP_HINTS[group]}
                                                </p>
                                            ) : null}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </fieldset>

                {enabledButNothing && (
                    <div
                        className="flex items-start gap-2.5 rounded-md border border-warning/20 bg-warning/10 p-3"
                        role="status"
                    >
                        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                        <p className="text-xs leading-relaxed text-foreground/80">
                            Nothing selected, so agents would connect and find no tools. Choose at
                            least one group, or turn the switch off.
                        </p>
                    </div>
                )}

                <div className="flex items-center justify-between gap-3 pt-1">
                    <p className="text-xs text-muted-foreground">
                        Agent calls, including refused ones, appear in the audit log under{" "}
                        <span className="font-medium">agent</span>.
                    </p>
                    <Button
                        size="sm"
                        onClick={handleSave}
                        disabled={!dirty || saving || enabledButNothing}
                    >
                        {saving ? "Saving…" : "Save"}
                    </Button>
                </div>

                {/*
                    HOW TO ACTUALLY CONNECT. Until this existed, the endpoint URL lived only in
                    docs/MCPServer.md inside the repository: an admin could turn the surface on, a
                    user could mint a token, and nothing anywhere told them where to send it. For a
                    self-hosted product that means the last step of the setup is in a file the
                    operator never opens.

                    GATED ON `stored.enabled`, NOT the `enabled` switch above. The switch is local
                    until Save, so keying off it would print connection instructions for a surface
                    that is still closed — and someone would follow them, get a refusal, and go
                    looking for a fault in their client. This appears once the surface is really open.

                    No token shown here, because this card has none: it configures the surface, it
                    does not mint credentials. The config block carries an obvious placeholder and
                    points at the one screen where a real token exists for one moment.
                */}
                {stored?.enabled && (
                    <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3">
                        <div className="space-y-1">
                            <p className="text-sm font-medium">Connecting a client</p>
                            <p className="text-xs text-muted-foreground">
                                Streamable-HTTP MCP: one endpoint, JSON-RPC 2.0, protocol{" "}
                                <code className="rounded bg-muted px-1">2024-11-05</code>. Stateless,
                                so there is no session to establish or reconnect.
                            </p>
                        </div>

                        {endpoint ? (
                            <>
                                <div className="space-y-1.5">
                                    <Label className="text-xs">Endpoint</Label>
                                    <CopyableCode value={endpoint} label="endpoint URL" />
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-xs">
                                        Client config (Claude Desktop, Cursor, …)
                                    </Label>
                                    <CopyableCode value={clientConfig} label="client config" />
                                    <p className="text-xs text-muted-foreground">
                                        Replace{" "}
                                        <code className="rounded bg-muted px-1">
                                            {MCP_TOKEN_PLACEHOLDER}
                                        </code>{" "}
                                        with a token from{" "}
                                        <span className="font-medium">Settings → API tokens</span>.
                                        Tokens are shown once, so paste it straight in here.
                                    </p>
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-xs">Check it works</Label>
                                    <CopyableCode value={curlExample} label="test command" />
                                    <p className="text-xs text-muted-foreground">
                                        An empty tool list means the token holds no scopes, or no
                                        group above is enabled — not that the connection failed.
                                    </p>
                                </div>
                            </>
                        ) : (
                            /*
                                Deliberately does not guess a hostname. A plausible-looking wrong URL
                                inside a block people copy without reading is worse than saying so.
                            */
                            <p className="text-xs text-destructive">
                                The endpoint URL can&apos;t be resolved because this build has no
                                backend URL configured (NEXT_PUBLIC_BACKEND_URL). The path is{" "}
                                <code className="rounded bg-muted px-1">/v1/mcp</code> on your API
                                host.
                            </p>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    )
}

export default MCPServerCard
