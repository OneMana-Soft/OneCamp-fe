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
 * groups without enabling looks like it took effect when nothing changed. So the
 * edits wait in a save bar, which appears only while something differs from what is
 * stored, and stays in view while you scroll this long section.
 *
 * Until the stored setting is read there is no form. A failed read used to show the
 * switch as off, which an admin reads as "the door is closed", with a Save that could
 * never be pressed.
 *
 * THE GROUPS COME FROM THE SERVER, not from a list in here. A group a new tool
 * introduces appears without anyone remembering to add it, and a group with no tools
 * can never be offered. The same reason the audit log serves its own categories.
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { SettingsList, SettingsSection, SwitchRow, SaveBar } from "@/components/ui/settingsSection"
import { ErrorState } from "@/components/ui/error-state"
import { StatusWord } from "@/components/ui/statusWord"
import { SectionListSkeleton } from "@/components/admin/SectionListSkeleton"
import { useToast } from "@/hooks/use-toast"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { ShieldAlert } from "@/lib/icons"
import { CopyableCode } from "@/components/ui/copyable-code"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
    MCP_TOKEN_PLACEHOLDER,
    mcpClientConfig,
    mcpConnectRecipes,
    mcpCurlExample,
    mcpEndpointUrl,
} from "@/lib/utils/mcpEndpoint"
import { getAIMCPServer, setAIMCPServer, type MCPServerSettings } from "@/services/aiModelService"

/** The stored value meaning "every group, including ones added later". */
const ALL = "*"

/** A connection recipe's steps, on every tab alike. */
const STEPS = "list-decimal space-y-1.5 pl-4 text-xs text-muted-foreground marker:text-muted-foreground"

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
    tasks: "Read tasks, and change status, assignee and due dates, in projects the token's owner belongs to.",
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

function MCPServerCard() {
    const { toast } = useToast()
    const [stored, setStored] = useState<MCPServerSettings | undefined>()
    const [enabled, setEnabled] = useState(false)
    const [selected, setSelected] = useState<string[]>([])
    const [allGroups, setAllGroups] = useState(false)
    const [saving, setSaving] = useState(false)
    const [failed, setFailed] = useState(false)
    const [failure, setFailure] = useState("")
    const [retrying, setRetrying] = useState(false)

    // Derived from the same base URL axios uses, so these cannot drift from the instance being
    // administered. Memoised only because they are strings rebuilt on every keystroke otherwise;
    // they depend on nothing that changes at runtime.
    const endpoint = useMemo(() => mcpEndpointUrl(), [])
    const clientConfig = useMemo(() => mcpClientConfig(), [])
    const curlExample = useMemo(() => mcpCurlExample(), [])
    const recipes = useMemo(() => mcpConnectRecipes(), [])

    // Self-contained, like every sibling admin card: it fetches its own state so the
    // settings page does not have to know this card exists beyond rendering it.
    const load = useCallback(async () => {
        try {
            setStored(await getAIMCPServer())
            setFailed(false)
        } catch (e) {
            // No form on defaults: a switch shown as off is read as "the surface is
            // closed", and that must only ever be said by the server.
            setFailure(apiErrorMessage(e, "Try again in a moment."))
            setFailed(true)
        }
    }, [])

    useEffect(() => {
        void load()
    }, [load])

    // Re-sync whenever stored settings arrive, so the form starts from the truth rather
    // than from a stale first render. Also what Discard puts back.
    const resetToStored = useCallback(() => {
        if (!stored) return
        const groups = parseGroups(stored.tool_groups)
        setEnabled(stored.enabled)
        setAllGroups(groups.includes(ALL))
        setSelected(groups.filter((g) => g !== ALL))
    }, [stored])
    useEffect(resetToStored, [resetToStored])

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
                title: "External agent access saved",
                description: enabled
                    ? "Outside agents can reach the groups you chose."
                    : "Outside agents can't connect.",
            })
            // Re-read rather than assume: the stored value is the truth this form must
            // show, and the server normalises what it was sent.
            await load()
        } catch (e) {
            toast({
                title: "Couldn't save external agent access",
                // The server names the valid groups when one is unrecognised, so its
                // message is more useful than anything written here.
                description: apiErrorMessage(e, "Try again in a moment."),
                variant: "destructive",
            })
        } finally {
            setSaving(false)
        }
    }

    return (
        <SettingsSection
            title={
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    External agent access (MCP)
                    {stored ? (
                        // A state, so a dot and a word rather than a tinted badge.
                        <StatusWord tone={stored.enabled ? "success" : "neutral"} className="text-sm font-normal">
                            {stored.enabled ? "On" : "Off"}
                        </StatusWord>
                    ) : null}
                </span>
            }
            description="Let outside agents work here over the Model Context Protocol, from a local model on Ollama to Claude, ChatGPT or Grok Bot. Each call runs as the person who approved the agent, so it can't reach anything they couldn't open, and every call, allowed or refused, goes in the audit log. Choosing groups here narrows what is reachable; it never widens anyone's permissions."
        >
            {!stored && failed ? (
                <ErrorState
                    compact
                    subject="the external agent access setting"
                    detail={failure}
                    retrying={retrying}
                    onRetry={() => {
                        setRetrying(true)
                        void load().finally(() => setRetrying(false))
                    }}
                />
            ) : !stored ? (
                <SectionListSkeleton label="Loading the external agent access setting" rows={1} trailing="switch" />
            ) : (
            <div className="space-y-5">
                <SettingsList>
                    <SwitchRow
                        label="Allow external agents to connect"
                        description="Off by default. While it's off, every call is refused, whatever a token allows."
                        checked={enabled}
                        disabled={saving}
                        onChange={setEnabled}
                    />
                </SettingsList>

                <fieldset className="space-y-3" disabled={!enabled}>
                    <legend className="text-sm font-medium">What agents can reach</legend>
                    <p className="text-xs text-muted-foreground">
                        Start with one group, watch the agent activity in the audit log, then widen.
                        Nothing is exposed until you choose at least one. A group covers both
                        reading and writing in that area: a token still needs the matching write
                        scope to change anything, so a read-only token stays read-only.
                    </p>

                    <div className="flex items-start gap-2.5">
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
                        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning-ink" />
                        <p className="text-xs leading-relaxed text-foreground/80">
                            Nothing selected, so agents would connect and find no tools. Choose at
                            least one group, or turn the switch off.
                        </p>
                    </div>
                )}

                <p className="text-xs text-muted-foreground">
                    Agent calls, including refused ones, appear in Admin, Audit log, under{" "}
                    <span className="font-medium">Agent</span>.
                </p>

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
                    // A section of its own, not a box holding more boxes: the
                    // address and each tab's code blocks are the only boxes.
                    <SettingsSection
                        level={3}
                        title="Connecting an agent"
                        description="Paste the address into the agent and sign in. Whoever approves it picks the agent it acts as, so it arrives with a sponsor, shows up in the agent inventory, and stops when that agent is paused."
                    >
                        {endpoint ? (
                            <div className="space-y-3">
                                <div className="space-y-1.5">
                                    <p className="text-xs text-muted-foreground">Address</p>
                                    <CopyableCode value={endpoint} label="MCP address" />
                                </div>

                                <Tabs defaultValue={recipes[0].id} className="space-y-2">
                                    <TabsList className="h-auto flex-wrap justify-start">
                                        {recipes.map((r) => (
                                            <TabsTrigger key={r.id} value={r.id} className="text-xs">
                                                {r.name}
                                            </TabsTrigger>
                                        ))}
                                        <TabsTrigger value="token" className="text-xs">
                                            Scripts & other clients
                                        </TabsTrigger>
                                    </TabsList>
                                    {recipes.map((r) => (
                                        <TabsContent key={r.id} value={r.id} className="mt-0 space-y-2">
                                            <ol className={STEPS}>
                                                {r.steps.map((step) => (
                                                    <li key={step}>{step}</li>
                                                ))}
                                            </ol>
                                            {r.snippet && r.snippet !== endpoint && (
                                                <CopyableCode value={r.snippet} label={`${r.name} setup`} />
                                            )}
                                        </TabsContent>
                                    ))}
                                    {/* The same numbered steps as every client's tab, each
                                        with its block inside it; it opened with a code
                                        block, then prose, then a second block. */}
                                    <TabsContent value="token" className="mt-0 space-y-2">
                                        <ol className={STEPS}>
                                            <li className="space-y-1.5">
                                                <p>Give the client this configuration.</p>
                                                <CopyableCode value={clientConfig} label="client config" />
                                            </li>
                                            <li>
                                                It can&apos;t sign in, so replace{" "}
                                                <code className="rounded bg-muted px-1">{MCP_TOKEN_PLACEHOLDER}</code> with a
                                                token from <span className="font-medium">Settings, API tokens</span>, ideally
                                                bound to an agent. Tokens are shown once.
                                            </li>
                                            <li className="space-y-1.5">
                                                <p>Check it works.</p>
                                                <CopyableCode value={curlExample} label="test command" />
                                                <p>
                                                    An empty tool list means the token holds no scopes, or no group above
                                                    is enabled, not that the connection failed.
                                                </p>
                                            </li>
                                        </ol>
                                    </TabsContent>
                                </Tabs>
                            </div>
                        ) : (
                            /*
                                Deliberately does not guess a hostname. A plausible-looking wrong URL
                                inside a block people copy without reading is worse than saying so.
                            */
                            <p className="text-xs text-danger-ink">
                                The address can&apos;t be shown because this server has no API
                                address set (NEXT_PUBLIC_BACKEND_URL). It is{" "}
                                <code className="rounded bg-muted px-1">/v1/mcp</code> on your API
                                host.
                            </p>
                        )}
                    </SettingsSection>
                )}

                {/* Saving waits for this bar while nothing is selected: the
                    server refuses an open surface with no groups, and the
                    warning above says why. */}
                <SaveBar
                    dirty={dirty && !enabledButNothing}
                    saving={saving}
                    what="external agent access changes"
                    onSave={() => void handleSave()}
                    onDiscard={resetToStored}
                />
            </div>
            )}
        </SettingsSection>
    )
}

export default MCPServerCard
