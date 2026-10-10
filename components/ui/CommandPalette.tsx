"use client"

import { displayNameOf } from "@/lib/personName"
import * as React from "react"
import { useRouter } from "next/navigation"
import { usePathname } from "next/navigation"
import { useDispatch, useSelector } from "react-redux"
import { Home, CheckSquare, Calendar, Bell, FileText, MessageCircle, Hash, Users, Shield, Plus, Search, Settings, User, LogOut, GitBranch, Sparkles, Clock, Trash2, Monitor, Bookmark, FolderKanban, Zap, ClipboardList, CircleCheck, UserPlus, Key, Mail, Github, Brain, ExternalLink, BarChart3, Target, TrendingUp, Lock, LayoutDashboard } from "@/lib/icons";
import { Plug } from "lucide-react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import { openUI } from "@/store/slice/uiSlice"
import { addRecentItem, type RecentItem } from "@/store/slice/recentItemsSlice"
import { useFetch } from "@/hooks/useFetch"
import { useSearch } from "@/hooks/useSearch"
import { useDebounce } from "@/hooks/useDebounce"
import { matchScore, NAMED_MATCH, paletteTargets, rankTargets, type PaletteTarget } from "@/lib/search/paletteMatch"
import { getContext, getHighlightedTitle, getIcon, getTitle, hitHueId, searchResultKeys } from "@/lib/utils/helpers/search"
import { IdentityMark } from "@/components/ui/graphics/IdentityMark"
import { Tile } from "@/components/ui/graphics/Tile"
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
  app_doc_activity,
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
import { Columns2, Keyboard, Maximize2 } from "@/lib/icons"
import { FEATURE_AI, FEATURE_CALLS, useClientConfig } from "@/hooks/useClientConfig"
import { projectAt } from "@/lib/task/startingProject"

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
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const COMMAND_GROUPS = ["Navigate", "Create", "View", "GitHub", "AI", "Admin", "Settings"] as const
const NO_RECENT: RecentItem[] = []

// Titles are the decoded, plain text a hit shows (stored bodies are escaped
// HTML, so a message's first 40 characters could end in "&#39").
function makeSearchRecentItem(result: SearchResult): Omit<RecentItem, "timestamp"> | null {
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
    case "chat":
      return { id: result.chat.chat_id, type: "chat", title: title || "Message", path: `/app/chat/${result.chat.chat_by_user_id}` }
    default:
      return null
  }
}

const RECENT_GLYPH: Record<RecentItem["type"], typeof Clock> = {
  task: CheckSquare,
  channel: Hash,
  doc: FileText,
  project: FolderKanban,
  team: Users,
  chat: MessageCircle,
  user: User,
}

/**
 * A recent item's mark: its own identity hue (lib/campHue), on a tile, with
 * its kind's glyph; a person as their coloured initials. Each kind had one
 * raw Tailwind colour (every task blue, every channel orange), which said the
 * kind twice and nothing about which one.
 */
function recentItemMark(item: Pick<RecentItem, "id" | "type" | "title">) {
  if (item.type === "user") return <IdentityMark variant="avatar" size={24} id={item.id} label={item.title} />
  const Glyph = RECENT_GLYPH[item.type] ?? Clock
  return <IdentityMark variant="tile" size={24} id={item.id} icon={<Glyph />} />
}

// A source is a category, so each has a fixed hue.
function aiSourceIcon(source: UnifiedSource) {
  switch (source) {
    case "memory": return <Tile hue="dusk" size="sm"><Brain /></Tile>
    case "gmail": return <Tile hue="berry" size="sm"><Mail /></Tile>
    case "github": return <Tile hue="sky" size="sm"><Github /></Tile>
    default: return <Tile hue="lake" size="sm"><Sparkles /></Tile>
  }
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function CommandPalette() {
  const [open, setOpen] = React.useState(false)
  const router = useRouter()
  const pathname = usePathname()
  const dispatch = useDispatch()
  const recentItems = useSelector((state: RootState) => state.recentItems?.items || NO_RECENT)

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

  // Keyboard shortcut: Cmd+K or Ctrl+K (unified global entry point)
  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [])

  // Closing any way (Escape, a click outside, the shortcut again) starts the
  // next opening empty. It used to keep the last query, so typing again ran
  // the two together ("q4q4") and found nothing.
  React.useEffect(() => {
    if (open) return
    setInputValue("")
  }, [open, setInputValue])

  const runCommand = React.useCallback((command: () => void) => {
    setOpen(false)
    setInputValue("")
    command()
  }, [setInputValue])

  const handleSearchSelect = React.useCallback((result: SearchResult) => {
    const item = makeSearchRecentItem(result)
    if (item) dispatch(addRecentItem(item))
    runCommand(() => handleResultClick(result))
  }, [runCommand, handleResultClick, dispatch])

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
        icon: <Home className="mr-2 h-4 w-4" />,
        group: "Navigate",
        action: () => router.push(app_home_path),
      },
      {
        id: "nav-tasks",
        label: "My tasks",
        keywords: ["tasks", "my tasks", "todo"],
        icon: <CircleCheck className="mr-2 h-4 w-4" />,
        group: "Navigate",
        action: () => router.push(app_my_task_path),
      },
      {
        id: "nav-calendar",
        label: "Calendar",
        keywords: ["calendar", "events", "schedule"],
        icon: <Calendar className="mr-2 h-4 w-4" />,
        group: "Navigate",
        action: () => router.push(app_calendar_path),
      },
      {
        id: "nav-activity",
        label: "Activity",
        keywords: ["activity", "notifications", "mentions"],
        icon: <Bell className="mr-2 h-4 w-4" />,
        group: "Navigate",
        action: () => router.push(app_doc_activity),
      },
      {
        id: "nav-later",
        label: "Later",
        keywords: ["later", "saved", "bookmarks", "reminders", "remind me"],
        icon: <Bookmark className="mr-2 h-4 w-4" />,
        group: "Navigate",
        action: () => router.push(app_later_path),
      },
      {
        id: "nav-docs",
        label: "Docs",
        keywords: ["docs", "documents", "wiki"],
        icon: <FileText className="mr-2 h-4 w-4" />,
        group: "Navigate",
        action: () => router.push(app_doc_path),
      },
      {
        id: "nav-boards",
        label: "Boards",
        keywords: ["boards", "canvas", "whiteboard", "diagram", "miro"],
        // The board glyph the sidebar's Boards and every board row use; it was
        // the page glyph, so Boards read as a second Docs.
        icon: <LayoutDashboard className="mr-2 h-4 w-4" />,
        group: "Navigate",
        action: () => router.push(app_board_path),
      },
      {
        id: "nav-dms",
        label: "DMs",
        keywords: ["dm", "chat", "messages", "direct message"],
        icon: <MessageCircle className="mr-2 h-4 w-4" />,
        group: "Navigate",
        action: () => router.push(app_chat_path),
      },
      {
        id: "nav-projects",
        label: "Projects",
        keywords: ["projects", "work"],
        icon: <FolderKanban className="mr-2 h-4 w-4" />,
        group: "Navigate",
        action: () => router.push(app_project_path),
      },
      {
        id: "nav-workload",
        label: "Workload",
        keywords: ["workload", "capacity", "who has room", "overloaded", "busy", "resourcing"],
        icon: <BarChart3 className="mr-2 h-4 w-4" />,
        group: "Navigate",
        action: () => router.push(`${app_project_path}?view=workload`),
      },
      {
        id: "nav-goals",
        label: "Goals",
        keywords: ["goals", "okr", "objectives", "key results", "targets", "initiatives", "outcomes"],
        icon: <Target className="mr-2 h-4 w-4" />,
        group: "Navigate",
        action: () => router.push(`${app_project_path}?view=goals`),
      },
      {
        id: "nav-reports",
        label: "Reports",
        keywords: ["reports", "dashboard", "analytics", "charts", "throughput", "overdue", "velocity", "portfolio", "burnup", "status report"],
        icon: <TrendingUp className="mr-2 h-4 w-4" />,
        group: "Navigate",
        action: () => router.push(`${app_project_path}?view=reports`),
      },
      {
        id: "nav-teams",
        label: "Teams",
        keywords: ["teams", "groups"],
        icon: <Users className="mr-2 h-4 w-4" />,
        group: "Navigate",
        action: () => router.push(app_team_path),
      },
      {
        id: "nav-recordings",
        label: "Recordings",
        keywords: ["recordings", "calls", "videos"],
        icon: <Monitor className="mr-2 h-4 w-4" />,
        group: "Navigate",
        action: () => router.push(app_recording_activity),
      },
      {
        id: "nav-search",
        label: "Search everything",
        keywords: ["search", "find", "global"],
        icon: <Search className="mr-2 h-4 w-4" />,
        group: "Navigate",
        action: () => router.push("/app/search"),
      },
      {
        id: "nav-templates",
        label: "Templates",
        keywords: ["templates", "gallery", "agent", "automation", "table", "install", "reuse"],
        icon: <Sparkles className="mr-2 h-4 w-4" />,
        group: "Navigate",
        action: () => router.push("/app/templates"),
      },

      // Create
      {
        id: "create-task",
        label: "Create task",
        keywords: ["new task", "add task", "todo"],
        icon: <Plus className="mr-2 h-4 w-4" />,
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
        icon: <Plus className="mr-2 h-4 w-4" />,
        group: "Create",
        action: () => dispatch(openUI({ key: "createChannel" })),
      },
      {
        id: "create-project",
        label: "Create project",
        keywords: ["new project", "add project"],
        icon: <Plus className="mr-2 h-4 w-4" />,
        group: "Create",
        action: () => dispatch(openUI({ key: "createProject" })),
      },
      {
        id: "create-team",
        label: "Create team",
        keywords: ["new team", "add team"],
        icon: <Plus className="mr-2 h-4 w-4" />,
        group: "Create",
        action: () => dispatch(openUI({ key: "createTeam" })),
      },
      {
        id: "create-doc",
        label: "Create doc",
        keywords: ["new doc", "add doc", "wiki"],
        icon: <Plus className="mr-2 h-4 w-4" />,
        group: "Create",
        action: () => dispatch(openUI({ key: "createDoc" })),
      },
      {
        id: "create-event",
        label: "Create calendar event",
        keywords: ["new event", "add event", "meeting"],
        icon: <Plus className="mr-2 h-4 w-4" />,
        group: "Create",
        action: () => dispatch(openUI({ key: "createCalendarEvent" })),
      },
      {
        id: "create-dm",
        label: "Start a direct message",
        keywords: ["new dm", "start chat", "message"],
        icon: <Plus className="mr-2 h-4 w-4" />,
        group: "Create",
        action: () => dispatch(openUI({ key: "createChatMessage" })),
      },
      {
        id: "start-instant-meeting",
        featureKey: FEATURE_CALLS,
        label: "Start instant meeting",
        keywords: ["meeting", "meet", "call", "video", "guest", "instant", "invite"],
        icon: <Plus className="mr-2 h-4 w-4" />,
        group: "Create",
        action: () => router.push("/app/meet/instant"),
      },

      // GitHub
      {
        id: "github-integrations",
        label: "GitHub integrations",
        keywords: ["github", "git", "repos", "integrations"],
        icon: <GitBranch className="mr-2 h-4 w-4" />,
        group: "GitHub",
        action: () => router.push("/app/admin?tab=integrations"),
      },

      // AI
      {
        id: "ai-ask",
        featureKey: FEATURE_AI,
        label: "Ask AI Second Brain",
        keywords: ["ai", "ask", "second brain", "gpt"],
        icon: <Sparkles className="mr-2 h-4 w-4" />,
        group: "AI",
        action: () => router.push("/app/ai"),
      },
      {
        id: "ai-memory",
        featureKey: FEATURE_AI,
        label: "Workspace Memory",
        keywords: ["ai", "memory", "decisions", "commitments", "open questions", "knowledge"],
        icon: <Sparkles className="mr-2 h-4 w-4" />,
        group: "AI",
        action: () => router.push("/app/ai/memory"),
      },
      {
        id: "ai-extract-tasks",
        featureKey: FEATURE_AI,
        label: "Create tasks from a conversation",
        keywords: ["tasks", "action items", "extract", "todo", "follow up", "ai", "convert", "meeting notes"],
        icon: <Sparkles className="mr-2 h-4 w-4" />,
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
        icon: <User className="mr-2 h-4 w-4" />,
        group: "Settings",
        action: () => dispatch(openUI({ key: "selfUserProfile" })),
      },
      {
        id: "settings",
        label: "Settings",
        keywords: ["settings", "preferences", "config", "theme", "appearance"],
        icon: <Settings className="mr-2 h-4 w-4" />,
        group: "Settings",
        action: () => router.push("/app/settings"),
      },
      {
        id: "notification-settings",
        label: "Notification settings",
        keywords: ["notifications", "email", "alerts", "preferences", "mute", "subscribe", "unsubscribe", "digest", "quiet hours"],
        icon: <Bell className="mr-2 h-4 w-4" />,
        group: "Settings",
        action: () => router.push("/app/settings/notifications"),
      },
      {
        id: "connectors",
        label: "Connectors",
        keywords: ["connectors", "gmail", "email", "google calendar", "github", "integrations", "connect", "oauth", "accounts"],
        icon: <Plug className="mr-2 h-4 w-4" />,
        group: "Settings",
        action: () => router.push("/app/settings/connectors"),
      },
      {
        id: "api-tokens",
        label: "API tokens",
        keywords: ["api", "token", "tokens", "developer", "sdk", "personal access token", "pat", "integration", "mcp", "programmatic", "rest"],
        icon: <Key className="mr-2 h-4 w-4" />,
        group: "Settings",
        action: () => router.push("/app/settings/api-tokens"),
      },
      {
        id: "workflows",
        label: "Workflows",
        keywords: ["workflows", "automation", "automate", "rules", "triggers", "bot"],
        icon: <Zap className="mr-2 h-4 w-4" />,
        group: "Settings",
        capabilityKey: CAP_WORKFLOW_MANAGE,
        action: () => router.push("/app/settings/workflows"),
      },
      {
        id: "agents",
        featureKey: FEATURE_AI,
        label: "AI agents",
        keywords: ["agents", "ai agent", "automation", "bot", "assistant", "build agent"],
        icon: <Sparkles className="mr-2 h-4 w-4" />,
        group: "Settings",
        capabilityKey: CAP_AGENT_MANAGE,
        action: () => router.push("/app/settings/agents"),
      },
      {
        id: "invite-people",
        label: "Invite people",
        keywords: ["invite", "add member", "add people", "invitation"],
        icon: <UserPlus className="mr-2 h-4 w-4" />,
        group: "Settings",
        capabilityKey: CAP_INVITATION_CREATE,
        action: () => window.dispatchEvent(new CustomEvent("open-invite-people")),
      },
      {
        id: "status",
        label: "Set your status",
        keywords: ["status", "emoji", "mood"],
        icon: <Zap className="mr-2 h-4 w-4" />,
        group: "Settings",
        action: () => dispatch(openUI({ key: "userStatusUpdate" })),
      },
      {
        id: "logout",
        // "Sign out", the pair of the sign-in page's "Sign in", as the phone's
        // menu says it; "log out" still finds it.
        label: "Sign out",
        keywords: ["sign out", "logout", "log out", "exit"],
        icon: <LogOut className="mr-2 h-4 w-4" />,
        group: "Settings",
        action: () => router.push("/logout"),
      },

      // Admin
      {
        id: "admin-dashboard",
        label: "Admin",
        keywords: ["admin", "dashboard", "manage"],
        icon: <Shield className="mr-2 h-4 w-4" />,
        group: "Admin",
        adminOnly: true,
        action: () => router.push(app_admin),
      },
      {
        id: "admin-users",
        label: "Members",
        keywords: ["users", "members", "people"],
        icon: <Users className="mr-2 h-4 w-4" />,
        group: "Admin",
        adminOnly: true,
        action: () => router.push("/app/admin?tab=users"),
      },
      {
        id: "admin-teams",
        label: "Manage teams",
        keywords: ["teams", "groups"],
        icon: <ClipboardList className="mr-2 h-4 w-4" />,
        group: "Admin",
        adminOnly: true,
        action: () => router.push("/app/admin?tab=teams"),
      },
      {
        id: "admin-webhooks",
        label: "Manage webhooks",
        keywords: ["webhooks", "integrations", "api"],
        icon: <Zap className="mr-2 h-4 w-4" />,
        group: "Admin",
        adminOnly: true,
        action: () => router.push("/app/admin?tab=webhooks"),
      },
      {
        id: "admin-archive",
        label: "Archive",
        keywords: ["archive", "cleanup", "policies"],
        icon: <Trash2 className="mr-2 h-4 w-4" />,
        group: "Admin",
        adminOnly: true,
        action: () => router.push("/app/admin?tab=archive"),
      },
      // Side by side (split view). Opened here, then the Ctrl+Alt keys.
      {
        id: "view-split-here",
        label: "Open this page side by side",
        keywords: ["split", "side by side", "pane", "beside", "multiple"],
        icon: <Columns2 className="mr-2 h-4 w-4" />,
        group: "View",
        action: () => splitRun({ type: "openHere" }),
      },
      {
        id: "view-focus",
        label: "Focus: this view alone",
        keywords: ["focus", "maximize", "zen", "one view", "split"],
        icon: <Maximize2 className="mr-2 h-4 w-4" />,
        group: "View",
        action: () => splitRun({ type: "focus" }),
      },
      {
        id: "view-full-screen",
        label: "Full screen",
        keywords: ["fullscreen", "full screen", "focus", "present"],
        icon: <Maximize2 className="mr-2 h-4 w-4" />,
        group: "View",
        action: () => splitRun({ type: "fullScreen" }),
      },
      {
        id: "view-shortcuts",
        label: "Keyboard shortcuts",
        keywords: ["keys", "shortcuts", "hotkeys", "keyboard"],
        icon: <Keyboard className="mr-2 h-4 w-4" />,
        group: "View",
        action: () => openShortcuts(),
      },
    ]

    return base.filter((cmd) => {
      if (cmd.adminOnly && !isAdmin) return false
      if (cmd.capabilityKey && !can(cmd.capabilityKey)) return false
      // Fails closed, like every other feature gate: an absent key, an explicit false
      // and a config request still in flight all mean "do not offer it".
      if (cmd.featureKey && features?.[cmd.featureKey] !== true) return false
      return true
    })
  }, [router, dispatch, isAdmin, can, features, pathname, splitRun])

  // Every command in its group, shown while nothing is typed: drawn once per
  // set of commands rather than on every render of the palette. Built in
  // render, all eighty were new elements each time, and every one
  // re-rendered. (Typed, the palette lists its own best matches instead.)
  const commandGroups = React.useMemo(
    () =>
      COMMAND_GROUPS.map((group) => {
        const groupCommands = commands.filter((c) => c.group === group)
        if (groupCommands.length === 0) return null
        return (
          <React.Fragment key={group}>
            <CommandGroup heading={group}>
              {groupCommands.map((cmd) => (
                <CommandItem
                  key={cmd.id}
                  onSelect={() => runCommand(cmd.action)}
                  value={`cmd-${cmd.id}`}
                >
                  {cmd.icon}
                  <span>{cmd.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </React.Fragment>
        )
      }),
    [commands, runCommand],
  )

  const query = inputValue.trim()
  const hasSearchQuery = query.length > 0
  const showRecent = !hasSearchQuery && recentItems.length > 0
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
  // While typing, the commands that match, best first; with no query, all of
  // them in their groups.
  const { matchedCommands, commandScore } = React.useMemo(() => {
    if (!hasSearchQuery) return { matchedCommands: [] as PaletteCommand[], commandScore: 0 }
    const ranked = commands
      .map((cmd, i) => ({ cmd, i, score: matchScore(query, cmd.label, cmd.keywords) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || a.i - b.i)
      .slice(0, 6)
    return { matchedCommands: ranked.map((x) => x.cmd), commandScore: ranked[0]?.score ?? 0 }
  }, [commands, query, hasSearchQuery])
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

  const commandsGroup = hasSearchQuery && matchedCommands.length > 0 && (
    <CommandGroup heading="Commands">
      {matchedCommands.map((cmd) => (
        <CommandItem key={cmd.id} value={`cmd-${cmd.id}`} onSelect={() => runCommand(cmd.action)}>
          {cmd.icon}
          <span>{cmd.label}</span>
          <span className="ml-auto shrink-0 pl-3 text-xs text-muted-foreground">{cmd.group}</span>
        </CommandItem>
      ))}
    </CommandGroup>
  )

  return (
    // The palette filters on its own (lib/search/paletteMatch). Left to cmdk,
    // the server's hits were filtered a second time against the 60 characters
    // of their title, and a message that matched further in was dropped: 5 of
    // 7 hits showed for "pricing".
    <CommandDialog open={open} onOpenChange={setOpen} commandProps={{ shouldFilter: false, loop: true }}>
      <CommandInput
        placeholder="Search or jump to…"
        hint={<ShortcutHint />}
        value={inputValue}
        onValueChange={setInputValue}
      />
      <CommandList className="max-h-[60vh]">
        {commandsLead && commandsGroup}

        {/* Places from the sidebar: these answer on the keystroke. */}
        {jumpTo.length > 0 && (
          <CommandGroup heading="Jump to">
            {jumpTo.map((t) => (
              <CommandItem key={`jump-${t.kind}-${t.id}`} value={`jump-${t.kind}-${t.id}`} onSelect={() => handleTargetSelect(t)}>
                {targetIcon(t)}
                <span className="truncate">{t.label}</span>
                <span className="ml-auto shrink-0 pl-3 text-xs text-muted-foreground">{TARGET_KIND_LABEL[t.kind]}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {commandsNamed && !commandsLead && commandsGroup}

        {/* The workspace's search, a moment later. An older answer stays,
            dimmed, while the next one loads, so the rows don't blank. */}
        {hasSearchQuery && (hasSearchResults || isSearching) && (
          <CommandGroup heading="Messages, docs and tasks" className={isRefreshing ? "opacity-60 transition-opacity duration-150" : "transition-opacity duration-150"}>
            {isSearching && !hasSearchResults && (
              <div role="status" className="px-2 py-2 text-sm text-muted-foreground">
                Searching…
              </div>
            )}
            {hits.slice(0, 8).map((result, idx) => (
              <CommandItem
                key={`hit-${hitKeys[idx]}`}
                value={`hit-${hitKeys[idx]}`}
                onSelect={() => handleSearchSelect(result)}
              >
                {getIcon(result)}
                <span className="min-w-0 flex-1 truncate">{getHighlightedTitle(result)}</span>
                <span className="ml-auto max-w-[40%] shrink-0 truncate pl-3 text-xs text-muted-foreground">{getContext(result)}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {/* Unified AI results — Memory facts + connected apps (Gmail/GitHub). */}
        {hasSearchQuery &&
          aiGroups.map((g) => (
            <CommandGroup key={`ai-${g.source}`} heading={g.source === "memory" ? "Memory" : g.label}>
              {g.hits.map((h, idx) => (
                <CommandItem
                  key={`ai-${g.source}-${idx}`}
                  onSelect={() => handleAiHitSelect(h)}
                  value={`ai-${g.source}-${idx}`}
                >
                  {aiSourceIcon(g.source)}
                  <span className="truncate">{h.title}</span>
                  {h.meta && <span className="ml-auto truncate pl-2 text-xs text-muted-foreground">{h.meta}</span>}
                  {(g.source === "gmail" || g.source === "github") && (
                    <ExternalLink className="ml-2 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          ))}

        {/* Commands the query only brushes (inside a word, or a keyword)
            wait under what the search found. */}
        {!commandsNamed && commandsGroup}

        {hasSearchQuery && (
          <CommandGroup>
            {nothingYet && !isSearching && (
              <p className="px-2 pb-1 pt-2 text-sm text-muted-foreground">Nothing here matches “{query}”.</p>
            )}
            <CommandItem value="search-everything" onSelect={searchEverything}>
              <Search className="mr-2 h-4 w-4" />
              <span className="truncate">Search everything for “{query}”</span>
            </CommandItem>
          </CommandGroup>
        )}

        {/* Recent Items */}
        {showRecent && (
          <CommandGroup heading="Recent">
            {recentItems.map((item) => (
              <CommandItem
                key={`recent-${item.type}-${item.id}`}
                onSelect={() => handleRecentSelect(item)}
                value={`recent-${item.type}-${item.id}`}
              >
                {recentItemMark(item)}
                <span className="truncate">{item.title}</span>
                <span className="ml-auto text-xs text-muted-foreground capitalize">{item.type}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {showRecent && <CommandSeparator />}

        {/* Commands — grouped by category */}
        {!hasSearchQuery && commandGroups}

        {/* Footer hint */}
        {!hasSearchQuery && (
          <div className="flex items-center justify-between px-4 py-2 text-2xs text-muted-foreground border-t">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <kbd className="px-1 rounded border bg-muted font-mono">↑↓</kbd> navigate
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1 rounded border bg-muted font-mono">↵</kbd> select
              </span>
            </div>
            <span className="flex items-center gap-1">
              <kbd className="px-1 rounded border bg-muted font-mono">Esc</kbd> close
            </span>
          </div>
        )}
      </CommandList>
    </CommandDialog>
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

const TARGET_GLYPH: Record<PaletteTarget["kind"], typeof Hash> = {
  channel: Hash,
  chat: MessageCircle,
  project: FolderKanban,
  team: Users,
  doc: FileText,
  board: LayoutDashboard,
}

/** A place's mark, in its identity hue: a person as their face, a private channel with a lock. */
function targetIcon(t: PaletteTarget) {
  if (t.kind === "chat") return <IdentityMark variant="avatar" size={24} id={t.hueId ?? t.id} label={t.label} />
  const Glyph = t.kind === "channel" && t.isPrivate ? Lock : TARGET_GLYPH[t.kind]
  return <IdentityMark variant="tile" size={24} id={t.hueId ?? t.id} icon={<Glyph />} />
}


/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * The shortcut that opens the palette, as a key chip beside the input rather
 * than "(Ctrl+K)" inside the placeholder, where it read as part of the query
 * and vanished the moment you typed. ⌘ on a Mac, Ctrl elsewhere. Read after
 * mount so the server and the first client render agree.
 */
function ShortcutHint() {
  const [mac, setMac] = React.useState(false)
  React.useEffect(() => {
    setMac(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent))
  }, [])
  return (
    // Clear of the dialog's close button, which sits over the end of the
    // input row: CommandDialog pads the row's right end past it, chip or no
    // chip (paletteHint.test.ts); the two overlapped. A margin here as well
    // left the chip floating 40px short of the button.
    <kbd className="hidden shrink-0 rounded-sm border bg-muted px-1.5 font-sans text-2xs text-muted-foreground sm:inline-block" aria-label={mac ? "Command K" : "Control K"}>
      {mac ? "⌘\u00a0K" : "Ctrl\u00a0K"}
    </kbd>
  )
}
