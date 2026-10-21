"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { usePathname } from "next/navigation"
import { useDispatch, useSelector } from "react-redux"
import { usePhone } from "@/hooks/usePhone"
import { Home, Calendar, Bell, Inbox, FileText, MessageCircle, Users, Shield, Plus, Search, Settings, User, LogOut, GitBranch, Sparkles, Trash2, Monitor, Bookmark, FolderKanban, Zap, ClipboardList, CircleCheck, UserPlus, Key, Mail, Github, Brain, ExternalLink, Bot, BarChart3, Target, TrendingUp, LayoutDashboard } from "@/lib/icons";
import { Plug } from "lucide-react";

import * as DialogPrimitive from "@radix-ui/react-dialog"
import { Command as CommandPrimitive } from "cmdk"
import { useTheme } from "next-themes"
import { CommandGroup, CommandItem } from "@/components/ui/command"
import { Button } from "@/components/ui/button"
import { AgentAvatar } from "@/components/ui/graphics/PrincipalAvatar"
import { cn } from "@/lib/utils/helpers/cn"
import { GO_KEYS } from "@/lib/goKeys"
import { paneFromHref } from "@/lib/split"
import { openInSplit, selectSplitOn } from "@/store/slice/splitActions"
import { usePauseNotifications } from "@/hooks/usePauseNotifications"
import {
  announcePaletteState,
  onPaletteOpenRequest,
  takePendingPaletteRequest,
  type OpenPaletteRequest,
} from "@/lib/ui/palette"
import { openUI } from "@/store/slice/uiSlice"
import { addRecentItem, type RecentItem } from "@/store/slice/recentItemsSlice"
import { useFetch } from "@/hooks/useFetch"
import { useSearch } from "@/hooks/useSearch"
import { SaysLoadFailure } from "@/lib/http/loadFailure"
import { useDebounce } from "@/hooks/useDebounce"
import { matchScore, NAMED_MATCH, paletteTargets, rankTargets, type PaletteTarget } from "@/lib/search/paletteMatch"
import { resultPath } from "@/lib/search/resultPath"
import { getContext, getHighlightedTitle, getIcon, getTitle, hitHueId, searchResultKeys } from "@/lib/utils/helpers/search"
import { Tile } from "@/components/ui/graphics/Tile"
import { RecentMark, recentHue } from "@/components/ui/graphics/recentMark"
import { PlaceMark, placeMarkHue, type MarkedPlace } from "@/components/ui/graphics/placeMark"
import { CATEGORY_KIND, isBuiltInStatus } from "@/lib/taskStatus"
import type { PlaceHue } from "@/lib/placeHue"
import { areaHue, type Area } from "@/lib/areas"
import { resultHue } from "@/lib/search/resultHue"
import {
  unifiedSearch,
  isAbortedRequest,
  type UnifiedSearchGroup,
  type UnifiedSource,
  type UnifiedHit,
} from "@/services/aiSearchService"
import { useTrackPageVisit } from "@/hooks/useTrackPageVisit"
import { useCapabilities } from "@/hooks/useCapabilities"
import { CAP_WORKFLOW_MANAGE, CAP_INVITATION_CREATE, CAP_AGENT_MANAGE } from "@/services/capabilityService"
import { GetEndpointUrl } from "@/services/endPoints"
import { UserProfileInterface } from "@/types/user"
import type { RootState } from "@/store/store"
import {
  app_home_path,
  app_my_task_path,
  app_calendar_path,
  app_inbox_path,
  app_mail_path,
  app_doc_path,
  app_board_path,
  app_chat_path,
  app_project_path,
  app_team_path,
  app_admin,
  app_recording_activity,
  app_later_path,
} from "@/types/paths"
import { SearchResult } from "@/services/searchService"
import { useSplitActions } from "@/hooks/useSplitView"
import { openShortcuts } from "@/components/shortcuts/ShortcutsDialog"
import { pauseEndsLine, pausePresets } from "@/lib/notifications/pause"
import { ArrowLeft, ArrowRight, BellOff, ChevronRight, Columns2, Columns3, Keyboard, Maximize2, MessageSquarePlus, Moon, Sun } from "@/lib/icons"
import { FEATURE_AI, FEATURE_CALLS, useClientConfig } from "@/hooks/useClientConfig"
import { projectAt } from "@/lib/task/startingProject"
import { clockTime } from "@/lib/utils/date/clock"
import { paletteEntries } from "@/components/docEditor/registry/commandBus"
import { isComposingKey } from "@/lib/keys/ime"

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface PaletteCommand {
  id: string
  label: string
  keywords: string[]
  icon: React.ReactNode
  group: string
  action: () => void
  adminOnly?: boolean
  // capabilityKey gates the command behind a delegatable capability — shown
  // only when the current user may exercise it (admins always can).
  capabilityKey?: string
  // featureKey gates the command behind an OPTIONAL SUBSYSTEM being present on this
  // server. A different question from capabilityKey: that asks whether this USER is
  // allowed to do it, this asks whether the server can do it AT ALL. The AI-free v1
  // edition serves no AI routes, and calls need a LiveKit server that the shipped
  // stack does not include — in both cases the command would open a page that cannot
  // work, so it should not be offered.
  featureKey?: string
  /** Its keys, when it isn't a "go" command (an open doc's ⌘L). */
  keys?: string
  /** Offered only where views can sit side by side (selectSplitOn), and for "views" only while some do. */
  split?: boolean | "views"
  /** A page of choices it opens in the palette (the theme, a pause), in place of an action. */
  page?: PalettePage
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const NO_RECENT: RecentItem[] = []

// Titles are the decoded, plain text a hit shows (stored bodies are escaped
// HTML, so a message's first 40 characters could end in "&#39"). A message
// opens where the search page opens it (resultPath): in its DM or group, at
// its thread. It used to open /app/chat/<its author>, a DM with yourself for
// your own message and a one-to-one with the author for a group's.
function makeSearchRecentItem(result: SearchResult, selfUUID: string): Omit<RecentItem, "timestamp"> | null {
  const title = getTitle(result).slice(0, 60)
  switch (result.type) {
    case "task":
      return { id: result.task.task_id, type: "task", title: title || "Task", path: `/app/task/${result.task.task_id}` }
    case "channel":
      return { id: result.channel.ch_id, type: "channel", title: title || "Channel", path: `/app/channel/${result.channel.ch_id}` }
    case "doc":
      return { id: result.doc.doc_uuid, type: "doc", title: title || "Untitled doc", path: `/app/doc/${result.doc.doc_uuid}` }
    case "project":
      return { id: result.project.project_id, type: "project", title: title || "Project", path: `/app/project/${result.project.project_id}` }
    case "team":
      return { id: result.team.team_id, type: "team", title: title || "Team", path: `/app/team/${result.team.team_id}` }
    case "chat": {
      const path = resultPath(result, selfUUID)
      return path ? { id: result.chat.chat_id, type: "chat", title: title || "Message", path } : null
    }
    default:
      return null
  }
}

/**
 * The area a command opens (lib/areas, design v3.1): its glyph sits on a tile
 * in that area's hue, as the site marks the area. A command that opens no
 * area (Home, the inbox, search, settings, templates, teams) keeps its plain
 * ink glyph, because colour names an area.
 */
export const COMMAND_AREA: Partial<Record<string, Area>> = {
  "nav-dms": "chat",
  "create-channel": "chat",
  "create-dm": "chat",
  "nav-recordings": "calls",
  "start-instant-meeting": "calls",
  "nav-docs": "docs",
  "create-doc": "docs",
  "nav-tasks": "projects",
  "nav-projects": "projects",
  "nav-workload": "projects",
  "nav-goals": "projects",
  "nav-reports": "projects",
  "create-task": "projects",
  "create-project": "projects",
  "nav-calendar": "calendar",
  "create-event": "calendar",
  "ai-ask": "agents",
  "ai-memory": "agents",
  "ai-extract-tasks": "agents",
  agents: "agents",
  "my-assistants": "agents",
}

/** A command's mark: on its area's tile when it opens an area, else bare. */
function commandMark(id: string, icon: React.ReactNode): React.ReactNode {
  const area = COMMAND_AREA[id]
  return area ? <Tile hue={areaHue(area)} size="sm" data-hue={areaHue(area)}>{icon}</Tile> : icon
}

// A source's tile (lib/areas, v3.1): memory is the agents' own, so it wears
// their indigo; a connector (Gmail, GitHub, the rest) names no area of
// OneCamp, so its tile is neutral ink.
function aiSourceIcon(source: UnifiedSource) {
  switch (source) {
    case "memory": return <Tile hue={areaHue("agents")} size="sm"><Brain /></Tile>
    case "gmail": return <Tile hue="ink" size="sm"><Mail /></Tile>
    case "github": return <Tile hue="ink" size="sm"><Github /></Tile>
    default: return <Tile hue="ink" size="sm"><Sparkles /></Tile>
  }
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function CommandPalette() {
  const [open, setOpen] = React.useState(false)
  // A pushed page: an action that asks for its argument (P1, "Nested pages").
  const [page, setPage] = React.useState<PalettePage | null>(null)
  // Space's preview of the selected row (P3).
  const [peek, setPeek] = React.useState<PeekInfo | null>(null)
  const contentRef = React.useRef<HTMLDivElement>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const listRef = React.useRef<HTMLDivElement>(null)
  // Space previews only once the keyboard is walking the rows, or with an
  // empty field, so a space typed into a query stays a space.
  const navigatedByArrows = React.useRef(false)
  const isPhone = usePhone()
  const modKey = useModKey()
  const router = useRouter()
  const pathname = usePathname()
  const dispatch = useDispatch()
  const recentItems = useSelector((state: RootState) => state.recentItems?.items || NO_RECENT)
  const splitOn = useSelector(selectSplitOn)
  const sideBySide = useSelector((state: RootState) => (state.split?.panes?.length ?? 0) > 0)

  const { data: selfProfile } = useFetch<UserProfileInterface>(GetEndpointUrl.SelfProfile)
  const isAdmin = selfProfile?.data?.user_is_admin || false
  const { can } = useCapabilities()
  // Which optional subsystems this server actually has, so commands that need one
  // are not offered when it is absent.
  const { features } = useClientConfig()

  // Track page visits with real names from Redux
  useTrackPageVisit()

  // Global search. The palette's query is the search hook's own: a second
  // copy kept in step by an effect rendered the whole palette twice a key.
  const {
    inputValue,
    setInputValue,
    results: searchResults,
    isLoading: isSearching,
    isRefreshing,
    isError: searchFailed,
    isRetrying: searchRetrying,
    retry: retrySearch,
    handleResultClick,
  } = useSearch({ debounceMs: 150 })

  // What the sidebar already holds answers on the keystroke, before the
  // search request leaves: channels, people, projects, teams, docs, boards.
  // Read only while the palette is open, so a closed palette doesn't render
  // on every unread count.
  const sidebar = useSelector((state: RootState) => (open ? state.users.userSidebar : CLOSED_SIDEBAR))
  const selfId = selfProfile?.data?.user_uuid
  const targets = React.useMemo(() => paletteTargets(sidebar, selfId), [sidebar, selfId])

  // Unified AI search: fold Memory facts + connected-app (Gmail/GitHub) results
  // into the same palette so Cmd+K spans everything. The keyword "Search
  // Results" above already covers raw workspace content, so we drop the
  // unified "workspace" group here to avoid duplication.
  const debouncedAiQuery = useDebounce(inputValue, 350)
  const [aiGroups, setAiGroups] = React.useState<UnifiedSearchGroup[]>([])
  React.useEffect(() => {
    const q = debouncedAiQuery.trim()
    if (!open || q.length < 2) {
      // Only when there is something to clear: a fresh empty list is a new
      // state, and it re-rendered the palette on every key.
      setAiGroups((groups) => (groups.length === 0 ? groups : []))
      return
    }
    let cancelled = false
    // The palette re-queries as you type; abort the superseded request so the
    // server stops fanning out across connected accounts for a query nobody is
    // waiting on any more.
    const controller = new AbortController()
    unifiedSearch(q, controller.signal)
      .then((res) => {
        if (cancelled) return
        if (!res.enabled) {
          setAiGroups((groups) => (groups.length === 0 ? groups : []))
          return
        }
        setAiGroups((res.groups || []).filter((g) => g.source !== "workspace" && g.hits.length > 0))
      })
      .catch((e) => {
        if (!cancelled && !isAbortedRequest(e)) setAiGroups([])
      })
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [debouncedAiQuery, open])

  // Keyboard shortcut: Cmd+K or Ctrl+K (unified global entry point). It
  // opens on Search.
  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      // Taken already: a doc's ⌘K with text selected adds a link (its keymap
      // marks the key handled), as in Notion. With nothing selected it's ours.
      if (e.defaultPrevented) return
      // ⌘P too, as in Notion (small-details P10): it printed the app.
      if ((e.key === "k" || e.key === "p") && (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [])

  // Opened from elsewhere: the sidebar pill, the phone's search icon, a 404's
  // Search button with the broken path as the query (lib/ui/palette). A
  // request made before this lazy palette mounted is taken now, so the first
  // click is never lost.
  React.useEffect(() => {
    const apply = (r: OpenPaletteRequest) => {
      setPage(null)
      if (r.query) setInputValue(r.query)
      setOpen(true)
    }
    const early = takePendingPaletteRequest()
    if (early) apply(early)
    return onPaletteOpenRequest(apply)
  }, [setInputValue])

  // The pill that opened the palette stays pressed while it is up.
  React.useEffect(() => {
    announcePaletteState(open)
  }, [open])

  // Closing any way (Escape, a click outside, the shortcut again) starts the
  // next opening empty, on Search, at the top level. It used to keep the last
  // query, so typing again ran the two together ("q4q4") and found nothing.
  React.useEffect(() => {
    if (open) return
    setInputValue("")
    setPage(null)
    setPeek(null)
    navigatedByArrows.current = false
  }, [open, setInputValue])

  // The 2px sweep under the field, only once a search has taken 300ms.
  const busy = inputValue.trim().length > 0 && (isSearching || !!isRefreshing)
  const [sweep, setSweep] = React.useState(false)
  React.useEffect(() => {
    if (!busy) {
      setSweep(false)
      return
    }
    const t = setTimeout(() => setSweep(true), 300)
    return () => clearTimeout(t)
  }, [busy])

  // A page push or pop: one 150ms bounce of the whole dialog, rows swapped
  // with no slide (cmdk and Linear's dialogBounce). Transform only; none at
  // all with reduced motion.
  const bounce = React.useCallback(() => {
    const el = contentRef.current
    if (!el?.animate || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return
    el.animate([{ transform: "scale(1)" }, { transform: "scale(.98)" }, { transform: "scale(1)" }], { duration: 150, easing: "ease-out" })
  }, [])
  const pushPage = React.useCallback(
    (next: PalettePage) => {
      setPage(next)
      setInputValue("")
      setPeek(null)
      bounce()
    },
    [setInputValue, bounce],
  )
  const popPage = React.useCallback(() => {
    setPage(null)
    bounce()
  }, [bounce])

  const runCommand = React.useCallback((command: () => void) => {
    setOpen(false)
    setInputValue("")
    command()
  }, [setInputValue])

  const handleSearchSelect = React.useCallback((result: SearchResult) => {
    const item = makeSearchRecentItem(result, selfId ?? "")
    if (item) dispatch(addRecentItem(item))
    runCommand(() => handleResultClick(result))
  }, [runCommand, handleResultClick, dispatch, selfId])

  const handleRecentSelect = React.useCallback((item: RecentItem) => {
    runCommand(() => router.push(item.path))
  }, [runCommand, router])

  const handleTargetSelect = React.useCallback((t: PaletteTarget) => {
    if (t.kind !== "board") dispatch(addRecentItem({ id: t.id, type: t.kind, title: t.label, path: t.path }))
    runCommand(() => router.push(t.path))
  }, [runCommand, router, dispatch])

  // Selecting a unified-AI hit: external sources open in a new tab; Memory
  // facts jump to their source (channel / project / group) when known, else
  // to the Workspace Memory surface.
  const handleAiHitSelect = React.useCallback(
    (hit: UnifiedHit) => {
      runCommand(() => {
        if ((hit.source === "gmail" || hit.source === "github") && hit.url) {
          window.open(hit.url, "_blank", "noopener,noreferrer")
          return
        }
        if (hit.source === "memory") {
          if (hit.channel_uuid) {
            router.push(`/app/channel/${hit.channel_uuid}`)
          } else if (hit.project_uuid) {
            router.push(`/app/project/${hit.project_uuid}`)
          } else if (hit.chat_grp_id && !hit.chat_grp_id.includes(" ") && hit.chat_grp_id.length === 32) {
            router.push(`/app/chat/group/${hit.chat_grp_id}`)
          } else {
            router.push("/app/ai/memory")
          }
        }
      })
    },
    [runCommand, router],
  )

  /* ---------------------------------------------------------------- */
  /*  Command definitions                                              */
  /* ---------------------------------------------------------------- */

  const splitRun = useSplitActions()

  const commands: PaletteCommand[] = React.useMemo(() => {
    const base: PaletteCommand[] = [
      // Navigation
      {
        id: "nav-home",
        label: "Home",
        keywords: ["home", "feed", "channels"],
        icon: <Home className="h-4 w-4" />,
        group: "Navigate",
        action: () => router.push(app_home_path),
      },
      {
        id: "nav-tasks",
        label: "My tasks",
        keywords: ["tasks", "my tasks", "todo"],
        icon: <CircleCheck className="h-4 w-4" />,
        group: "Navigate",
        action: () => router.push(app_my_task_path),
      },
      {
        id: "nav-calendar",
        label: "Calendar",
        keywords: ["calendar", "events", "schedule"],
        icon: <Calendar className="h-4 w-4" />,
        group: "Navigate",
        action: () => router.push(app_calendar_path),
      },
      {
        // Notifications and nudges: the page that was Activity (design v3, N1).
        id: "nav-inbox",
        label: "Inbox",
        keywords: ["inbox", "activity", "notifications", "mentions", "nudges"],
        icon: <Inbox className="h-4 w-4" />,
        group: "Navigate",
        action: () => router.push(app_inbox_path),
      },
      {
        // The person's own Gmail, which was "Inbox" before v3.
        id: "nav-mail",
        label: "Mail",
        keywords: ["mail", "gmail", "email", "inbox"],
        icon: <Mail className="h-4 w-4" />,
        group: "Navigate",
        action: () => router.push(app_mail_path),
      },
      {
        id: "nav-later",
        label: "Later",
        keywords: ["later", "saved", "bookmarks", "reminders", "remind me"],
        icon: <Bookmark className="h-4 w-4" />,
        group: "Navigate",
        action: () => router.push(app_later_path),
      },
      {
        id: "nav-docs",
        label: "Docs",
        keywords: ["docs", "documents", "wiki"],
        icon: <FileText className="h-4 w-4" />,
        group: "Navigate",
        action: () => router.push(app_doc_path),
      },
      {
        id: "nav-boards",
        label: "Boards",
        keywords: ["boards", "canvas", "whiteboard", "diagram", "miro"],
        // The board glyph the sidebar's Boards and every board row use; it was
        // the page glyph, so Boards read as a second Docs.
        icon: <LayoutDashboard className="h-4 w-4" />,
        group: "Navigate",
        action: () => router.push(app_board_path),
      },
      {
        id: "nav-dms",
        label: "DMs",
        keywords: ["dm", "chat", "messages", "direct message"],
        icon: <MessageCircle className="h-4 w-4" />,
        group: "Navigate",
        action: () => router.push(app_chat_path),
      },
      {
        id: "nav-projects",
        label: "Projects",
        keywords: ["projects", "work"],
        icon: <FolderKanban className="h-4 w-4" />,
        group: "Navigate",
        action: () => router.push(app_project_path),
      },
      {
        id: "nav-workload",
        label: "Workload",
        keywords: ["workload", "capacity", "who has room", "overloaded", "busy", "resourcing"],
        icon: <BarChart3 className="h-4 w-4" />,
        group: "Navigate",
        action: () => router.push(`${app_project_path}?view=workload`),
      },
      {
        id: "nav-goals",
        label: "Goals",
        keywords: ["goals", "okr", "objectives", "key results", "targets", "initiatives", "outcomes"],
        icon: <Target className="h-4 w-4" />,
        group: "Navigate",
        action: () => router.push(`${app_project_path}?view=goals`),
      },
      {
        id: "nav-reports",
        label: "Reports",
        keywords: ["reports", "dashboard", "analytics", "charts", "throughput", "overdue", "velocity", "portfolio", "burnup", "status report"],
        icon: <TrendingUp className="h-4 w-4" />,
        group: "Navigate",
        action: () => router.push(`${app_project_path}?view=reports`),
      },
      {
        id: "nav-teams",
        label: "Teams",
        keywords: ["teams", "groups"],
        icon: <Users className="h-4 w-4" />,
        group: "Navigate",
        action: () => router.push(app_team_path),
      },
      {
        id: "nav-recordings",
        label: "Recordings",
        keywords: ["recordings", "calls", "videos"],
        icon: <Monitor className="h-4 w-4" />,
        group: "Navigate",
        action: () => router.push(app_recording_activity),
      },
      {
        id: "nav-search",
        label: "Search everything",
        keywords: ["search", "find", "global"],
        icon: <Search className="h-4 w-4" />,
        group: "Navigate",
        action: () => router.push("/app/search"),
      },
      {
        id: "nav-templates",
        label: "Templates",
        keywords: ["templates", "gallery", "agent", "automation", "table", "install", "reuse"],
        icon: <Sparkles className="h-4 w-4" />,
        group: "Navigate",
        action: () => router.push("/app/templates"),
      },

      // Create
      {
        id: "create-task",
        label: "Create task",
        keywords: ["new task", "add task", "todo"],
        icon: <Plus className="h-4 w-4" />,
        group: "Create",
        // On a project's page the task starts in that project, as the page's
        // own New task button does.
        action: () => {
          const projectId = projectAt(pathname)
          dispatch(openUI(projectId ? { key: "createTask", data: { projectId } } : { key: "createTask" }))
        },
      },
      {
        id: "create-channel",
        label: "Create channel",
        keywords: ["new channel", "add channel"],
        icon: <Plus className="h-4 w-4" />,
        group: "Create",
        action: () => dispatch(openUI({ key: "createChannel" })),
      },
      {
        id: "create-project",
        label: "Create project",
        keywords: ["new project", "add project"],
        icon: <Plus className="h-4 w-4" />,
        group: "Create",
        action: () => dispatch(openUI({ key: "createProject" })),
      },
      {
        id: "create-team",
        label: "Create team",
        keywords: ["new team", "add team"],
        icon: <Plus className="h-4 w-4" />,
        group: "Create",
        action: () => dispatch(openUI({ key: "createTeam" })),
      },
      {
        id: "create-doc",
        label: "Create doc",
        keywords: ["new doc", "add doc", "wiki"],
        icon: <Plus className="h-4 w-4" />,
        group: "Create",
        action: () => dispatch(openUI({ key: "createDoc" })),
      },
      {
        id: "create-event",
        label: "Create calendar event",
        keywords: ["new event", "add event", "meeting"],
        icon: <Plus className="h-4 w-4" />,
        group: "Create",
        action: () => dispatch(openUI({ key: "createCalendarEvent" })),
      },
      {
        id: "create-dm",
        label: "Start a direct message",
        keywords: ["new dm", "start chat", "message"],
        icon: <Plus className="h-4 w-4" />,
        group: "Create",
        action: () => dispatch(openUI({ key: "createChatMessage" })),
      },
      {
        id: "start-instant-meeting",
        featureKey: FEATURE_CALLS,
        label: "Start instant meeting",
        keywords: ["meeting", "meet", "call", "video", "guest", "instant", "invite"],
        icon: <Plus className="h-4 w-4" />,
        group: "Create",
        action: () => router.push("/app/meet/instant"),
      },

      // GitHub
      {
        id: "github-integrations",
        label: "GitHub integrations",
        keywords: ["github", "git", "repos", "integrations"],
        icon: <GitBranch className="h-4 w-4" />,
        group: "GitHub",
        action: () => router.push("/app/admin?tab=integrations"),
      },

      // AI
      {
        id: "ai-ask",
        featureKey: FEATURE_AI,
        label: "Ask AI Second Brain",
        keywords: ["ai", "ask", "second brain", "gpt"],
        icon: <Sparkles className="h-4 w-4" />,
        group: "AI",
        action: () => router.push("/app/ai"),
      },
      {
        id: "ai-memory",
        featureKey: FEATURE_AI,
        label: "Workspace Memory",
        keywords: ["ai", "memory", "decisions", "commitments", "open questions", "knowledge"],
        icon: <Sparkles className="h-4 w-4" />,
        group: "AI",
        action: () => router.push("/app/ai/memory"),
      },
      {
        id: "ai-extract-tasks",
        featureKey: FEATURE_AI,
        label: "Create tasks from a conversation",
        keywords: ["tasks", "action items", "extract", "todo", "follow up", "ai", "convert", "meeting notes"],
        icon: <Sparkles className="h-4 w-4" />,
        group: "AI",
        action: () => {
          // Seed from the current route: a channel/DM/group becomes the source,
          // otherwise open in paste-text mode.
          const p = pathname || ""
          let data: { sourceType: "channel" | "dm" | "group" | "text"; sourceId?: string } = { sourceType: "text" }
          const ch = p.match(/^\/app\/channel\/([^/]+)/)
          const grp = p.match(/^\/app\/chat\/group\/([^/]+)/)
          if (ch) data = { sourceType: "channel", sourceId: ch[1] }
          else if (grp) data = { sourceType: "group", sourceId: grp[1] }
          dispatch(openUI({ key: "extractTasks", data }))
        },
      },

      // Settings & Account
      {
        id: "profile",
        label: "Profile",
        keywords: ["profile", "me", "account"],
        icon: <User className="h-4 w-4" />,
        group: "Settings",
        action: () => dispatch(openUI({ key: "selfUserProfile" })),
      },
      {
        id: "settings",
        label: "Settings",
        keywords: ["settings", "preferences", "config", "theme", "appearance"],
        icon: <Settings className="h-4 w-4" />,
        group: "Settings",
        action: () => router.push("/app/settings"),
      },
      {
        id: "notification-settings",
        label: "Notification settings",
        keywords: ["notifications", "email", "alerts", "preferences", "mute", "subscribe", "unsubscribe", "digest", "quiet hours"],
        icon: <Bell className="h-4 w-4" />,
        group: "Settings",
        action: () => router.push("/app/settings/notifications"),
      },
      {
        id: "connectors",
        label: "Connectors",
        keywords: ["connectors", "gmail", "email", "google calendar", "github", "integrations", "connect", "oauth", "accounts"],
        icon: <Plug className="h-4 w-4" />,
        group: "Settings",
        action: () => router.push("/app/settings/connectors"),
      },
      {
        id: "api-tokens",
        label: "API tokens",
        keywords: ["api", "token", "tokens", "developer", "sdk", "personal access token", "pat", "integration", "mcp", "programmatic", "rest"],
        icon: <Key className="h-4 w-4" />,
        group: "Settings",
        action: () => router.push("/app/settings/api-tokens"),
      },
      {
        id: "workflows",
        label: "Workflows",
        keywords: ["workflows", "automation", "automate", "rules", "triggers", "bot"],
        icon: <Zap className="h-4 w-4" />,
        group: "Settings",
        capabilityKey: CAP_WORKFLOW_MANAGE,
        action: () => router.push("/app/settings/workflows"),
      },
      {
        id: "agents",
        featureKey: FEATURE_AI,
        label: "AI agents",
        keywords: ["agents", "ai agent", "automation", "bot", "assistant", "build agent"],
        icon: <Sparkles className="h-4 w-4" />,
        group: "Settings",
        capabilityKey: CAP_AGENT_MANAGE,
        action: () => router.push("/app/settings/agents"),
      },
      {
        id: "invite-people",
        label: "Invite people",
        keywords: ["invite", "add member", "add people", "invitation"],
        icon: <UserPlus className="h-4 w-4" />,
        group: "Settings",
        capabilityKey: CAP_INVITATION_CREATE,
        action: () => window.dispatchEvent(new CustomEvent("open-invite-people")),
      },
      {
        id: "status",
        label: "Set your status",
        keywords: ["status", "emoji", "mood"],
        icon: <Zap className="h-4 w-4" />,
        group: "Settings",
        action: () => dispatch(openUI({ key: "userStatusUpdate" })),
      },
      {
        id: "logout",
        // "Sign out", the pair of the sign-in page's "Sign in", as the phone's
        // menu says it; "log out" still finds it.
        label: "Sign out",
        keywords: ["sign out", "logout", "log out", "exit"],
        icon: <LogOut className="h-4 w-4" />,
        group: "Settings",
        action: () => router.push("/logout"),
      },

      // Admin
      {
        id: "admin-dashboard",
        label: "Admin",
        keywords: ["admin", "dashboard", "manage"],
        icon: <Shield className="h-4 w-4" />,
        group: "Admin",
        adminOnly: true,
        action: () => router.push(app_admin),
      },
      {
        id: "admin-users",
        label: "Members",
        keywords: ["users", "members", "people"],
        icon: <Users className="h-4 w-4" />,
        group: "Admin",
        adminOnly: true,
        action: () => router.push("/app/admin?tab=users"),
      },
      {
        id: "admin-teams",
        label: "Manage teams",
        keywords: ["teams", "groups"],
        icon: <ClipboardList className="h-4 w-4" />,
        group: "Admin",
        adminOnly: true,
        action: () => router.push("/app/admin?tab=teams"),
      },
      {
        id: "admin-webhooks",
        label: "Manage webhooks",
        keywords: ["webhooks", "integrations", "api"],
        icon: <Zap className="h-4 w-4" />,
        group: "Admin",
        adminOnly: true,
        action: () => router.push("/app/admin?tab=webhooks"),
      },
      {
        id: "admin-archive",
        label: "Archive",
        keywords: ["archive", "cleanup", "policies"],
        icon: <Trash2 className="h-4 w-4" />,
        group: "Admin",
        adminOnly: true,
        action: () => router.push("/app/admin?tab=archive"),
      },
      // Side by side (split view). Opened here, then the Ctrl+Alt keys.
      {
        id: "view-split-here",
        label: "Open this page side by side",
        keywords: ["split", "side by side", "pane", "beside", "multiple"],
        icon: <Columns2 className="h-4 w-4" />,
        group: "View",
        split: true,
        action: () => splitRun({ type: "openHere" }),
      },
      {
        id: "view-focus",
        label: "Focus: this view alone",
        keywords: ["focus", "maximize", "zen", "one view", "split"],
        icon: <Maximize2 className="h-4 w-4" />,
        group: "View",
        split: true,
        action: () => splitRun({ type: "focus" }),
      },
      {
        id: "view-move-left",
        label: "Move this view left",
        keywords: ["move", "rearrange", "reorder", "left", "split", "side by side", "pane"],
        icon: <ArrowLeft className="h-4 w-4" />,
        group: "View",
        split: "views",
        action: () => splitRun({ type: "move", by: -1 }),
      },
      {
        id: "view-move-right",
        label: "Move this view right",
        keywords: ["move", "rearrange", "reorder", "right", "split", "side by side", "pane"],
        icon: <ArrowRight className="h-4 w-4" />,
        group: "View",
        split: "views",
        action: () => splitRun({ type: "move", by: 1 }),
      },
      {
        id: "view-even-out",
        label: "Even out the views' widths",
        keywords: ["even", "equal", "widths", "resize", "split", "side by side", "pane"],
        icon: <Columns3 className="h-4 w-4" />,
        group: "View",
        split: "views",
        action: () => splitRun({ type: "even" }),
      },
      {
        id: "view-full-screen",
        label: "Full screen",
        keywords: ["fullscreen", "full screen", "focus", "present"],
        icon: <Maximize2 className="h-4 w-4" />,
        group: "View",
        action: () => splitRun({ type: "fullScreen" }),
      },
      {
        id: "view-shortcuts",
        label: "Keyboard shortcuts",
        keywords: ["keys", "shortcuts", "hotkeys", "keyboard"],
        icon: <Keyboard className="h-4 w-4" />,
        group: "View",
        action: () => openShortcuts(),
      },
      // Found by what people type (QA SH-14): "dark" or "theme" found only
      // messages, while Change theme… sat in Suggested, out of reach.
      {
        id: "page-theme",
        label: "Change theme…",
        keywords: ["theme", "dark", "light", "dark mode", "light mode", "colour", "color", "appearance", "night"],
        icon: <Moon className="h-4 w-4" />,
        group: "Settings",
        action: () => {},
        page: "theme",
      },
      {
        id: "page-pause",
        label: "Pause notifications…",
        keywords: ["pause", "snooze", "do not disturb", "dnd", "quiet", "mute notifications"],
        icon: <BellOff className="h-4 w-4" />,
        group: "Settings",
        action: () => {},
        page: "pause",
      },
    ]

    return base.filter((cmd) => {
      if (cmd.adminOnly && !isAdmin) return false
      if (cmd.split && !splitOn) return false
      if (cmd.split === "views" && !sideBySide) return false
      if (cmd.capabilityKey && !can(cmd.capabilityKey)) return false
      // Fails closed, like every other feature gate: an absent key, an explicit false
      // and a config request still in flight all mean "do not offer it".
      if (cmd.featureKey && features?.[cmd.featureKey] !== true) return false
      return true
    })
  }, [router, dispatch, isAdmin, can, features, pathname, splitRun, splitOn, sideBySide])

  // The open doc's own actions (its page lists them: Version history, Full
  // width, Export…), asked for as the palette opens, found by typing.
  const docCommands: PaletteCommand[] = React.useMemo(() => {
    if (!open) return []
    return paletteEntries().map((entry) => {
      const Icon = entry.icon ?? FileText
      return { id: `doc:${entry.id}`, label: entry.label, keywords: entry.keywords, icon: <Icon className="h-4 w-4" />, group: "This doc", action: entry.run, keys: entry.keys }
    })
  }, [open])

  const query = inputValue.trim()
  const hasSearchQuery = query.length > 0
  // This edition has no AI: the palette is Search only, with no Ask mode.
  const jumpTo = React.useMemo(() => rankTargets(query, targets, 6), [query, targets])
  // A place already under "Jump to" isn't listed again among the hits: "Q4
  // launch" showed twice, once as a place and once as a project hit.
  const hits = React.useMemo(() => {
    const placed = new Set(jumpTo.map((t) => t.id))
    return searchResults.filter((r) => !(PLACE_TYPES.has(r.type) && placed.has(hitHueId(r) ?? "")))
  }, [searchResults, jumpTo])
  const hasSearchResults = hits.length > 0
  // A hit keeps its key (and the keyboard's place on it) as answers arrive.
  const hitKeys = React.useMemo(() => searchResultKeys(hits), [hits])
  // While typing, the commands that match, best first.
  const { matchedCommands, commandScore } = React.useMemo(() => {
    if (!hasSearchQuery) return { matchedCommands: [] as PaletteCommand[], commandScore: 0 }
    const ranked = [...docCommands, ...commands]
      .map((cmd, i) => ({ cmd, i, score: matchScore(query, cmd.label, cmd.keywords) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || a.i - b.i)
      .slice(0, 6)
    return { matchedCommands: ranked.map((x) => x.cmd), commandScore: ranked[0]?.score ?? 0 }
  }, [commands, docCommands, query, hasSearchQuery])
  // What the query names goes above what the search found in the text. Typed
  // whole, "Docs" sat under two tasks that only mention docs, and the row the
  // keyboard was on was halfway down the list. Places always lead (they match
  // on a name or a person); a command leads too when the query names it, and
  // the places when they name it better or as well.
  const placeScore = jumpTo.length > 0 ? matchScore(query, jumpTo[0].label, jumpTo[0].keywords) : 0
  const commandsNamed = commandScore >= NAMED_MATCH
  const commandsLead = commandsNamed && commandScore > placeScore
  const nothingYet = hasSearchQuery && jumpTo.length === 0 && !hasSearchResults && matchedCommands.length === 0 && aiGroups.length === 0
  const searchEverything = () => runCommand(() => router.push(`/app/search?query=${encodeURIComponent(query)}`))

  // The curated empty palette (Superhuman's rule): what you were just in,
  // then the few things people start from. Navigation waits until typed.
  const recent = recentItems.slice(0, 5)
  const suggested = React.useMemo(() => {
    const byId = (id: string) => commands.find((c) => c.id === id)
    const rows: { id: string; label: string; icon: React.ReactNode; run: () => void; keys?: string }[] = []
    const dm = byId("create-dm")
    if (dm) rows.push({ id: dm.id, label: "New message", icon: commandMark(dm.id, <MessageSquarePlus className="h-4 w-4" />), run: () => runCommand(dm.action) })
    const task = byId("create-task")
    if (task) rows.push({ id: task.id, label: "New task", icon: commandMark(task.id, <Plus className="h-4 w-4" />), run: () => runCommand(task.action) })
    rows.push({ id: "page-pause", label: "Pause notifications…", icon: <BellOff className="h-4 w-4" />, run: () => pushPage("pause") })
    const invite = byId("invite-people")
    if (invite) rows.push({ id: invite.id, label: invite.label, icon: <UserPlus className="h-4 w-4" />, run: () => runCommand(invite.action) })
    rows.push({ id: "page-theme", label: "Change theme…", icon: <Moon className="h-4 w-4" />, run: () => pushPage("theme") })
    return rows
  }, [commands, runCommand, pushPage])

  // A closest name, for "Did you mean …?" when nothing matched.
  const didYouMean = React.useMemo(() => (nothingYet ? closestName(query, [...targets.map((t) => t.label), ...docCommands.map((c) => c.label), ...commands.map((c) => c.label)]) : null), [nothingYet, query, targets, docCommands, commands])

  const commandsGroup = hasSearchQuery && matchedCommands.length > 0 && (
    <CommandGroup heading="Commands">
      {matchedCommands.map((cmd) => (
        <PaletteRow
          key={cmd.id}
          value={`cmd-${cmd.id}`}
          onSelect={() => (cmd.page ? pushPage(cmd.page) : runCommand(cmd.action))}
          icon={commandMark(cmd.id, cmd.icon)}
          label={highlight(cmd.label, query)}
          meta={cmd.group}
          keys={cmd.keys ?? commandKeys(cmd.id)}
          peek={{ title: cmd.label, kind: cmd.group }}
        />
      ))}
    </CommandGroup>
  )

  const searchBody = (
    <>
      {commandsLead && commandsGroup}

      {/* Places from the sidebar: these answer on the keystroke. */}
      {jumpTo.length > 0 && (
        <CommandGroup heading="Jump to">
          {jumpTo.map((t) => (
            <PaletteRow
              key={`jump-${t.kind}-${t.id}`}
              value={`jump-${t.kind}-${t.id}`}
              onSelect={() => handleTargetSelect(t)}
              icon={<PlaceMark place={targetPlace(t)} />}
              hue={placeMarkHue(targetPlace(t))}
              label={highlight(t.label, query)}
              meta={TARGET_KIND_LABEL[t.kind]}
              href={t.path}
              peek={{ title: t.label, kind: TARGET_KIND_LABEL[t.kind] }}
            />
          ))}
        </CommandGroup>
      )}

      {commandsNamed && !commandsLead && commandsGroup}

      {/* The workspace's search, a moment later. An older answer stays,
          dimmed, while the next one loads, so the rows don't blank. */}
      {hasSearchQuery && (hasSearchResults || isSearching) && (
        <CommandGroup heading="Messages, docs and tasks" className={isRefreshing ? "opacity-60 transition-opacity duration-150" : "transition-opacity duration-150"}>
          {isSearching && !hasSearchResults && (
            <div role="status" className="px-3 py-2 text-sm text-ink-3">
              Searching…
            </div>
          )}
          {hits.slice(0, 8).map((result, idx) => {
            // Where the row opens, the address it links to (resultPath).
            const href = resultPath(result, selfId ?? "") ?? undefined
            return (
              <PaletteRow
                key={`hit-${hitKeys[idx]}`}
                value={`hit-${hitKeys[idx]}`}
                onSelect={() => handleSearchSelect(result)}
                icon={hitMark(result)}
                hue={resultHue(result)}
                label={getHighlightedTitle(result)}
                meta={getContext(result)}
                href={href}
                peek={{ title: getTitle(result), kind: hitKindLabel(result.type), meta: String(getContext(result) ?? "") }}
              />
            )
          })}
        </CommandGroup>
      )}

      {/* Unified AI results: Memory facts and connected apps (Gmail, GitHub). */}
      {hasSearchQuery &&
        aiGroups.map((g) => (
          <CommandGroup key={`ai-${g.source}`} heading={g.source === "memory" ? "Memory" : g.label}>
            {g.hits.map((h, idx) => (
              <PaletteRow
                key={`ai-${g.source}-${idx}`}
                value={`ai-${g.source}-${idx}`}
                onSelect={() => handleAiHitSelect(h)}
                icon={aiSourceIcon(g.source)}
                label={h.title}
                meta={h.meta}
                trailing={(g.source === "gmail" || g.source === "github") ? <ExternalLink className="h-3.5 w-3.5 shrink-0 text-ink-3" /> : undefined}
                peek={{ title: h.title, kind: g.label, meta: h.meta }}
              />
            ))}
          </CommandGroup>
        ))}

      {/* Commands the query only brushes (inside a word, or a keyword)
          wait under what the search found. */}
      {!commandsNamed && commandsGroup}

      {hasSearchQuery && !nothingYet && (
        <CommandGroup>
          <PaletteRow
            value="search-everything"
            onSelect={searchEverything}
            icon={<Search className="h-4 w-4" />}
            label={<>Search everything for “{query}”</>}
          />
        </CommandGroup>
      )}

      {/* Nothing matched, and the search has answered: say so, kindly. A
          search that failed says that instead: "nothing called" would be
          untrue (QA DSA-04). */}
      {nothingYet && !isSearching && (
        <PaletteEmpty
          query={query}
          didYouMean={didYouMean}
          onDidYouMean={(name) => setInputValue(name)}
          onSearch={searchEverything}
          failed={searchFailed ? { onRetry: retrySearch, retrying: searchRetrying } : undefined}
        />
      )}

      {!hasSearchQuery && recent.length > 0 && (
        <CommandGroup heading="Recent">
          {recent.map((item) => (
            <PaletteRow
              key={`recent-${item.type}-${item.id}`}
              value={`recent-${item.type}-${item.id}`}
              onSelect={() => handleRecentSelect(item)}
              icon={<RecentMark item={item} />}
              hue={recentHue(item)}
              label={item.title}
              meta={RECENT_KIND_LABEL[item.type]}
              href={item.path}
              peek={{ title: item.title, kind: RECENT_KIND_LABEL[item.type] }}
            />
          ))}
        </CommandGroup>
      )}

      {!hasSearchQuery && (
        <CommandGroup heading="Suggested">
          {suggested.map((s) => (
            <PaletteRow key={s.id} value={`suggest-${s.id}`} onSelect={s.run} icon={s.icon} label={s.label} keys={s.keys} />
          ))}
        </CommandGroup>
      )}
    </>
  )

  const pageBody = page && (
    <CommandGroup>
      <PalettePageRows page={page} query={query} onDone={() => setOpen(false)} />
    </CommandGroup>
  )

  // Keys the palette answers before cmdk does: Tab between the modes, ⌘⏎,
  // Space for a peek, Backspace out of a page, the number keys on a page.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Tab" && !e.altKey && !e.ctrlKey && !e.metaKey) {
      // The field keeps the focus whatever happens.
      e.preventDefault()
      return
    }
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      const href = selectedRow()?.getAttribute("data-href")
      const pane = href && splitOn ? paneFromHref(href) : null
      if (pane) runCommand(() => dispatch(openInSplit(pane)))
      return
    }
    if (e.key === "Backspace" && page && inputValue === "") {
      e.preventDefault()
      popPage()
      return
    }
    if (page && inputValue === "" && /^[1-9]$/.test(e.key)) {
      const rows = listRef.current?.querySelectorAll<HTMLElement>("[cmdk-item]")
      const row = rows?.[Number(e.key) - 1]
      if (row) {
        e.preventDefault()
        row.click()
      }
      return
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      navigatedByArrows.current = true
      // The peek follows the keyboard, once cmdk has moved the selection.
      if (peek) requestAnimationFrame(() => setPeek(readPeek(selectedRow())))
      return
    }
    if (e.key === " " && !isPhone && !page && (inputValue === "" || navigatedByArrows.current)) {
      const next = readPeek(selectedRow())
      if (next) {
        e.preventDefault()
        setPeek((p) => (p ? null : next))
      }
    }
  }

  const footer =
    page ? (
      <>
        <span><kbd className="kbd">⌫</kbd> back</span>
        <span><kbd className="kbd">1</kbd>–<kbd className="kbd">9</kbd> choose</span>
        <span className="ml-auto"><kbd className="kbd">Esc</kbd> close</span>
      </>
    ) : (
      <>
        <span><kbd className="kbd">↑</kbd><kbd className="kbd">↓</kbd> move</span>
        <span><kbd className="kbd">⏎</kbd> open</span>
        {splitOn && <span><kbd className="kbd">{modKey}</kbd><kbd className="kbd">⏎</kbd> open beside</span>}
        <span className="ml-auto"><kbd className="kbd">Esc</kbd> close</span>
      </>
    )

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="palette-scrim" />
        <DialogPrimitive.Content
          ref={contentRef}
          data-command-dialog=""
          data-phone={isPhone ? "" : undefined}
          className="palette"
          aria-describedby={undefined}
          onEscapeKeyDown={(e) => {
            // Esc closes the peek first, then the palette.
            if (peek) {
              e.preventDefault()
              setPeek(null)
            }
          }}
          onOpenAutoFocus={(e) => {
            e.preventDefault()
            inputRef.current?.focus()
          }}
        >
          <DialogPrimitive.Title className="sr-only">Search, jump, or ask</DialogPrimitive.Title>
          {/* The palette filters on its own (lib/search/paletteMatch). Left to
              cmdk, the server's hits were filtered a second time against the
              60 characters of their title, and a message that matched further
              in was dropped: 5 of 7 hits showed for "pricing". */}
          <CommandPrimitive shouldFilter={false} loop onKeyDown={onKeyDown} className="flex min-h-0 flex-1 flex-col" label="Search or jump to">
            <div className="palette-input-row" data-mode="search">
              {page ? (
                <>
                  <span className="palette-crumb">{PAGE_CRUMB[page]}</span>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-ink-3" aria-hidden="true" />
                </>
              ) : (
                <Search className="h-[18px] w-[18px] shrink-0 text-ink-3" aria-hidden="true" />
              )}
              <CommandPrimitive.Input
                ref={inputRef}
                value={inputValue}
                onValueChange={(v) => {
                  navigatedByArrows.current = false
                  setInputValue(v)
                }}
                placeholder={page ? PAGE_PLACEHOLDER[page] : "Search or jump to…"}
                className="palette-input"
                autoFocus
              />
              {isPhone ? (
                <button type="button" className="palette-cancel" onClick={() => setOpen(false)}>
                  Cancel
                </button>
              ) : null}
              {sweep && <span className="palette-sweep" aria-hidden="true" />}
            </div>
            <CommandPrimitive.List ref={listRef} className="palette-list">
              {page ? (
                pageBody
              ) : (
                searchBody
              )}
            </CommandPrimitive.List>
            {!isPhone && <div data-kbd-hint="" className="palette-footer">{footer}</div>}
          </CommandPrimitive>
        </DialogPrimitive.Content>
        {peek && !isPhone && open && (
          <div className="palette-peek" role="note" aria-label={`Preview of ${peek.title}`}>
            <div className="text-2xs font-medium text-ink-3">{peek.kind}</div>
            <div className="mt-1 text-heading font-semibold text-ink">{peek.title}</div>
            {peek.meta && <div className="mt-2 text-xs text-ink-2">{peek.meta}</div>}
            <div className="mt-4 flex items-center gap-3 text-2xs text-ink-3">
              <span><kbd className="kbd">⏎</kbd> open</span>
              <span><kbd className="kbd">Space</kbd> close preview</span>
            </div>
          </div>
        )}
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

const CLOSED_SIDEBAR = {}

/** Hits that are places the sidebar knows: a project, channel, doc, team or board. */
const PLACE_TYPES = new Set<SearchResult["type"]>(["project", "channel", "doc", "team", "board"])

const TARGET_KIND_LABEL: Record<PaletteTarget["kind"], string> = {
  channel: "Channel",
  chat: "Direct message",
  project: "Project",
  team: "Team",
  doc: "Doc",
  board: "Board",
}

const RECENT_KIND_LABEL: Record<RecentItem["type"], string> = {
  task: "Task",
  channel: "Channel",
  doc: "Doc",
  project: "Project",
  team: "Team",
  chat: "Message",
  user: "Person",
}

function hitKindLabel(type: SearchResult["type"]): string {
  const known: Record<string, string> = { post: "Message", chat: "Direct message", task: "Task", doc: "Doc", project: "Project", channel: "Channel", team: "Team", board: "Board", user: "Person" }
  return known[type] ?? "Result"
}

/** A palette place as the one mark reads it (components/ui/graphics/placeMark). */
function targetPlace(t: PaletteTarget): MarkedPlace {
  switch (t.kind) {
    case "chat":
      return { kind: "person", label: t.label }
    case "project":
      return { kind: "project", id: t.hueId ?? t.id }
    case "channel":
      return { kind: "channel", id: t.id, isPrivate: t.isPrivate }
    default:
      return { kind: t.kind, id: t.id, label: t.label }
  }
}

/** A hit as the one mark reads it: a place's identity, a task's status, a message, reply or file's glyph. */
function hitPlace(result: SearchResult): MarkedPlace {
  switch (result.type) {
    case "project":
      return { kind: "project", id: result.project?.project_id }
    case "channel":
      return { kind: "channel", id: result.channel?.ch_id, isPrivate: !!result.channel?.ch_private }
    case "doc":
      // Search carries the doc's icon, its absence too.
      return { kind: "doc", id: result.doc?.doc_uuid, icon: result.doc?.doc_icon ?? null }
    case "task": {
      const status: string = result.task?.task_status ?? ""
      return { kind: "task", status: CATEGORY_KIND[isBuiltInStatus(status) ? status : "todo"] }
    }
    case "post":
      return { kind: "message" }
    case "chat":
    case "comment":
      return { kind: "reply" }
    case "attachment":
      return { kind: "file" }
    case "board":
    case "team":
      return { kind: result.type }
    default:
      return { kind: null }
  }
}

/**
 * A hit's mark, drawn as the places are (design v3, P1): the one mark
 * (PlaceMark) for every kind but a person, who leads with their face and its
 * photo (lib/utils/helpers/search getIcon).
 */
function hitMark(result: SearchResult) {
  if (result.type === "user") return getIcon(result)
  return <PlaceMark place={hitPlace(result)} />
}

/** The G-then-letter keys a navigation command has, shown so the row teaches them. */
const NAV_GO_KEY: Record<string, string> = Object.fromEntries(
  Object.entries({
    "nav-home": app_home_path,
    "nav-tasks": app_my_task_path,
    "nav-calendar": app_calendar_path,
    "nav-inbox": app_inbox_path,
    "nav-mail": app_mail_path,
    "nav-later": app_later_path,
    "nav-docs": app_doc_path,
    "nav-boards": app_board_path,
    "nav-dms": app_chat_path,
    "nav-projects": app_project_path,
  }).flatMap(([id, to]) => {
    const go = GO_KEYS.find((g) => g.to === to)
    return go ? [[id, `G ${go.key.toUpperCase()}`]] : []
  }),
)

/** A command's own keys, when it has any. */
export function commandKeys(id: string): string | undefined {
  if (id === "view-shortcuts") return "?"
  return NAV_GO_KEY[id]
}

/** The matched part of a name, in weight rather than colour (design v3, P1). */
function highlight(label: string, query: string): React.ReactNode {
  const q = query.trim()
  if (!q) return label
  const at = label.toLowerCase().indexOf(q.toLowerCase())
  if (at < 0) return label
  return (
    <>
      {label.slice(0, at)}
      <mark>{label.slice(at, at + q.length)}</mark>
      {label.slice(at + q.length)}
    </>
  )
}

/** The name nearest what was typed, a couple of letters off at most, for "Did you mean". Pure. */
export function closestName(query: string, names: string[]): string | null {
  const q = query.trim().toLowerCase()
  if (q.length < 3) return null
  const limit = Math.max(1, Math.floor(q.length / 4))
  let best: string | null = null
  let bestD = limit + 1
  for (const name of names) {
    const n = name.toLowerCase()
    if (Math.abs(n.length - q.length) > limit) continue
    const d = editDistance(q, n)
    if (d > 0 && d < bestD) {
      best = name
      bestD = d
    }
  }
  return best
}

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]
    row[0] = i
    for (let j = 1; j <= b.length; j++) {
      const keep = row[j]
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = keep
    }
  }
  return row[b.length]
}

interface PeekInfo {
  title: string
  kind: string
  meta?: string
}

/** The row cmdk has selected. */
function selectedRow(): HTMLElement | null {
  return document.querySelector<HTMLElement>(".palette [cmdk-item][data-selected=true]")
}

function readPeek(row: HTMLElement | null): PeekInfo | null {
  const title = row?.getAttribute("data-peek-title")
  if (!row || !title) return null
  return { title, kind: row.getAttribute("data-peek-kind") ?? "", meta: row.getAttribute("data-peek-meta") || undefined }
}

/**
 * One palette row (design v3, P1): 40px at r8, a 20px mark, the title, its
 * meta in ink-3, the row's own keys, and ⏎ when the keyboard is on it. The
 * selected row is the press fill with a 2px accent tick (globals.css). What a
 * peek shows and where ⌘⏎ opens ride on data attributes, so moving the
 * selection never re-renders the palette.
 */
function PaletteRow({
  value,
  onSelect,
  icon,
  hue,
  label,
  meta,
  keys,
  href,
  peek,
  trailing,
  className,
}: {
  value: string
  onSelect: () => void
  icon?: React.ReactNode
  /** The hue of what the row opens (lib/placeHue): its highlight tints in it (SH-24). */
  hue?: PlaceHue
  label: React.ReactNode
  meta?: React.ReactNode
  keys?: string
  href?: string
  peek?: PeekInfo
  trailing?: React.ReactNode
  className?: string
}) {
  return (
    <CommandItem
      value={value}
      onSelect={onSelect}
      className={cn("palette-row", className)}
      data-hue={hue}
      data-href={href}
      data-peek-title={peek?.title}
      data-peek-kind={peek?.kind}
      data-peek-meta={peek?.meta}
    >
      {icon && <span className="palette-mark">{icon}</span>}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {meta ? <span className="palette-meta">{meta}</span> : null}
      {trailing}
      {keys && <Keys keys={keys} />}
      <kbd data-kbd-hint="" className="kbd palette-enter" aria-hidden="true">⏎</kbd>
    </CommandItem>
  )
}

/** "G H" as two chips with "then" between; anything else as one chip. */
function Keys({ keys }: { keys: string }) {
  const parts = keys.split(" ")
  if (parts.length === 2 && parts[0] === "G") {
    return (
      <span data-kbd-hint="" className="palette-keys" aria-label={`G then ${parts[1]}`}>
        <kbd className="kbd">G</kbd>
        <span className="text-3xs text-ink-3">then</span>
        <kbd className="kbd">{parts[1]}</kbd>
      </span>
    )
  }
  return (
    <span data-kbd-hint="" className="palette-keys">
      <kbd className="kbd">{keys}</kbd>
    </span>
  )
}

/**
 * Nothing matched (design v3, P1 "Empty"): the spot, the words, two ways on.
 * When the search itself failed, it says so, with Try again.
 */
function PaletteEmpty({
  query,
  didYouMean,
  onDidYouMean,
  onSearch,
  onAsk,
  failed,
}: {
  query: string
  didYouMean: string | null
  onDidYouMean: (name: string) => void
  onSearch: () => void
  onAsk?: () => void
  failed?: { onRetry: () => void; retrying?: boolean }
}) {
  if (failed) {
    return (
      <div className="palette-empty" role="status" data-palette-search-failed="">
        {/* Said here, so the read's toast stays quiet. */}
        <SaysLoadFailure />
        <div className="text-heading text-ink">Couldn&apos;t search just now</div>
        <div className="mt-1 text-sm text-ink-2">Nothing has been lost. Try again in a moment.</div>
        <div className="mt-3 flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={failed.onRetry} disabled={failed.retrying}>
            {failed.retrying ? "Trying again…" : "Try again"}
          </Button>
        </div>
      </div>
    )
  }
  return (
    <div className="palette-empty" role="status">
      <svg width="72" height="72" viewBox="0 0 96 96" aria-hidden="true" data-spot="">
        <circle cx="48" cy="48" r="36" fill="var(--camp-lake-tint)" />
        <circle cx="48" cy="48" r="44" fill="none" stroke="var(--line-3)" strokeDasharray="1.5 5" strokeLinecap="round" />
        <circle cx="44" cy="44" r="14" fill="var(--raised)" stroke="var(--camp-lake)" strokeWidth="4" />
        <path d="m54 54 12 12" stroke="var(--camp-lake)" strokeWidth="5" strokeLinecap="round" />
        <path d="M74 18c.4 3.4 2.1 5.1 7 7-4.9 1.9-6.6 3.6-7 7-.4-3.4-2.1-5.1-7-7 4.9-1.9 6.6-3.6 7-7z" fill="var(--brand)" />
      </svg>
      <div className="mt-2.5 text-heading text-ink">Nothing called “{query}”</div>
      <div className="mt-1 text-sm text-ink-2">
        {didYouMean ? (
          <>
            Did you mean{" "}
            <button type="button" className="text-brand-text underline underline-offset-[3px]" onClick={() => onDidYouMean(didYouMean)}>
              {didYouMean}
            </button>
            ?{onAsk ? " Or ask OneCamp AI." : ""}
          </>
        ) : onAsk ? (
          "Try other words, or ask OneCamp AI."
        ) : (
          "Try other words, or search every message."
        )}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Button variant="secondary" size="sm" onClick={onSearch}>
          Search messages
        </Button>
        {onAsk && (
          <Button variant="ghost" size="sm" onClick={onAsk}>
            <AgentAvatar className="size-[18px]" />
            Ask
          </Button>
        )}
      </div>
    </div>
  )
}

type PalettePage = "theme" | "pause"

const PAGE_CRUMB: Record<PalettePage, string> = { theme: "Theme", pause: "Pause notifications" }
const PAGE_PLACEHOLDER: Record<PalettePage, string> = { theme: "Choose a theme…", pause: "Pause for…" }

/**
 * A pushed page's choices (design v3, P1 "Nested pages"): an action that
 * needs an argument asks for it here, numbered 1 to 9. The pause page reads
 * the notification settings only once it is open.
 */
function PalettePageRows({ page, query, onDone }: { page: PalettePage; query: string; onDone: () => void }) {
  if (page === "theme") return <ThemeRows query={query} onDone={onDone} />
  return <PauseRows query={query} onDone={onDone} />
}

function filterChoices<T extends { label: string }>(choices: T[], query: string): T[] {
  const q = query.trim().toLowerCase()
  return q ? choices.filter((c) => c.label.toLowerCase().includes(q)) : choices
}

function ThemeRows({ query, onDone }: { query: string; onDone: () => void }) {
  const { theme, setTheme } = useTheme()
  const choices = filterChoices(
    [
      { value: "light", label: "Light", icon: <Sun className="h-4 w-4" /> },
      { value: "dark", label: "Dark", icon: <Moon className="h-4 w-4" /> },
      { value: "system", label: "Match my device", icon: <Monitor className="h-4 w-4" /> },
    ],
    query,
  )
  return (
    <>
      {choices.map((c, i) => (
        <PaletteRow
          key={c.value}
          value={`theme-${c.value}`}
          onSelect={() => {
            setTheme(c.value)
            onDone()
          }}
          icon={c.icon}
          label={c.label}
          meta={(theme ?? "system") === c.value ? "Current" : undefined}
          keys={String(i + 1)}
        />
      ))}
    </>
  )
}

function PauseRows({ query, onDone }: { query: string; onDone: () => void }) {
  const { pause } = usePauseNotifications()
  // The pause dialog's own presets, each saying when it ends.
  const choices = filterChoices(pausePresets(new Date()), query)
  return (
    <>
      {choices.map((c, i) => (
        <PaletteRow
          key={c.label}
          value={`pause-${c.label}`}
          onSelect={() => {
            void pause(c.at)
            onDone()
          }}
          icon={<BellOff className="h-4 w-4" />}
          label={c.label}
          meta={pauseEndsLine(c, clockTime) || undefined}
          keys={String(i + 1)}
        />
      ))}
    </>
  )
}

/** ⌘ on a Mac, Ctrl elsewhere, for the footer's chips. Read after mount so the server and the first client render agree. */
function useModKey(): string {
  const [mac, setMac] = React.useState(false)
  React.useEffect(() => {
    setMac(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent))
  }, [])
  return mac ? "⌘" : "Ctrl"
}
