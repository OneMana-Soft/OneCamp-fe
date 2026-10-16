/**
 * Icon Registry
 * Centralized icon exports for consistent imports across the app.
 * All icons come from lucide-react. To add a new icon, export it here
 * and import from @/lib/icons instead of lucide-react directly.
 *
 * Categories:
 * - Navigation: sidebar, tabs, breadcrumbs
 * - Actions: buttons, menus, clickable
 * - Status: indicators, states
 * - Communication: chat, mentions, notifications
 * - Editor: text formatting, attachments
 * - Media: files, images, videos
 * - GitHub: PR, branch, commit, merge
 * - Calendar: events, dates, time
 * - Social: reactions, sharing
 * - System: settings, theme, search
 */

// ─── Navigation ─────────────────────────────────────────────
// Chat, design v3 (11 Oct 2026): the huddle, the bridge relay's arrows, a
// reply's connector, Record's stop, and the archive and remind actions.
export { Headphones, ArrowDownToLine, AlarmClock, Archive, Square, CornerUpLeft, CornerDownRight, Cpu, Hand } from "lucide-react";
export { ArrowLeftRight, Columns2 } from "lucide-react";
// Docs: the four-column row in "/" (B1).
export { Columns4 } from "lucide-react";
// A project's timeline tab, and its Unscheduled list.
export { ChartGantt, CalendarOff, CirclePlus } from "lucide-react";
// Goals: the view, a goal's page and its link from a project.
export { Target } from "lucide-react";
// Docs (B2): colour, the fourth heading, the table of contents, and callout icons.
export { Baseline, Heading4, TableOfContents, CircleAlert, Flame, BookOpen, GraduationCap } from "lucide-react";
export { Focus } from "lucide-react";
// Calls: the captions toggle (hub, 10 Oct 2026).
export { Captions, CaptionsOff } from "lucide-react";
// The calendar: time off (away) and an event's place (content v3).
export { Plane, MapPin } from "lucide-react";
// The green room's speaker row (hub v3) uses Headphones, exported above.
// Single sign-on on the sign-in page: the organisation's own way in.
export { Building2 } from "lucide-react";
// The v3 shell (11 Oct 2026): compose, the workspace menu, More, the foot.
export { Gauge, SquarePen, PanelLeft, Gift, Server, MonitorDown, CircleHelp } from "lucide-react";
// The work area (design v3): a project tile's glyphs, the timer, the list's Display menu and a grip.
export { Box, Heart, ListFilter, Columns3 } from "lucide-react"; // Timer and Square: exported with the boards and the chat icons
// Design v3, admin and settings (11 Oct 2026): the settings nav and its search.
export { FileCheck2, KeyRound, ScrollText, Users2, UserX, Webhook, CornerDownLeft } from "lucide-react"; // Archive: with the chat icons
// v3 admin slice: people (members, invitations, audit, evidence).
export { UserMinus, ShieldX, ShieldPlus, CalendarRange, Ban, PlayCircle } from "lucide-react";

// v3 admin slice: config (general, security, email, import, integrations, health).
export { HardDrive } from "lucide-react";

// v3 admin slice: connect (import, workflows, integrations, apps, webhooks, connectors).
export type { LucideIcon } from "lucide-react";
// connect/import: HardDrive is exported in the config block above.
// connect/workflows:
// connect/integrations:
// connect/apps-webhooks:
export { LogIn } from "lucide-react";

// v3 admin slice: ai (AI & agents, agents and skills, assistants).
export { CircleSlash } from "lucide-react"; // Cpu: with the chat icons
export { BadgeCheck } from "lucide-react"; // ShieldX is in the people block.

// v3 admin slice: you (notifications, connectors, tokens, profile).
// A passkey row's glyph for a computer.
export { Laptop } from "lucide-react";

// v3 admin slice: auth (sign-in, sign-up, first run, consent).
export { ArrowBigUp } from "lucide-react";

// v3 admin slice: feedback (dialogs, confirms, sheets, guest channel).
export { Power } from "lucide-react"; // UserMinus is in the people block.

export {
  Home,
  Hash,
  MessageSquare,
  MessageCircle,
  Bell,
  Calendar,
  CheckSquare,
  Folder,
  FileText,
  Flag,
  Megaphone,
  UserPlus,
  Users,
  User,
  CircleUser,
  Search,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  ArrowRightToLine,
  Kanban,
  Repeat,
  CalendarCheck,
  CalendarX,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
} from "lucide-react";

// ─── Actions ────────────────────────────────────────────────
export {
  Plus,
  X,
  Check,
  CheckCircle,
  CheckCircle2,
  Pencil,
  Edit2,
  Trash,
  Trash2,
  Save,
  Download,
  Printer,
  Upload,
  Copy,
  Pin,
  PinOff,
  RotateCcw,
  RefreshCw,
  RefreshCcw,
  Undo2,
  Redo2,
  IndentIncrease,
  IndentDecrease,
  ClipboardCheck,
  CircleStop,
} from "lucide-react";

// ─── Status ─────────────────────────────────────────────────
export {
  Loader2,
  LoaderCircle,
  AlertCircle,
  AlertTriangle,
  Info,
  WifiOff,
  HelpCircle,
  Circle,
  CircleDot,
  XCircle,
} from "lucide-react";

// ─── Communication ──────────────────────────────────────────
export {
  SendHorizontal,
  Send,
  Mail,
  MailPlus,
  AtSign,
  Reply,
  Forward,
  Share,
  Share2,
  MessageSquareText,
  MessageSquarePlus,
  PhoneOff,
  Video,
  VideoOff,
  Mic,
  MicOff,
  BellOff,
} from "lucide-react";

// ─── Editor / Content ───────────────────────────────────────
export {
  Type,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListTodo,
  Coins,
  ClipboardList,
  CircleCheck,
  Quote,
  Code,
  // A code block, told apart from inline code; and clearing a selection's marks.
  SquareCode,
  RemoveFormatting,
  Image as ImageIcon,
  Paperclip,
  Link,
  Link2,
  ExternalLink,
  Unlink,
  AlignLeft,
  Table,
  Minus,
  Sparkles,
  // Marks an answer whose prompt was shortened to fit the model's context window.
  Scissors,
  Zap,
  Plug,
  Lightbulb,
  Workflow,
  Milestone,
  Route,
  Network,
  Smartphone,
  Command,
  Eraser,
  Activity,
} from "lucide-react";

// ─── Media / Files ──────────────────────────────────────────
// A doc's pictures, embeds and files (docs B4): crop, replace, align, a resize grip.
export { Crop, Replace, AlignCenter, StretchHorizontal, GripHorizontal } from "lucide-react";
export {
  File,
  FileImage,
  FileVideo,
  FileAudio2,
  FileCode,
  FileSpreadsheet,
  FileArchive,
  FolderKanban,
  Image,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Clapperboard,
  Camera,
  Presentation,
  LayoutDashboard,
  Disc,
  SkipBack,
  SkipForward,
} from "lucide-react";

// ─── GitHub / Dev ───────────────────────────────────────────
export {
  Github,
  GitBranch,
  GitCommit,
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  GitPullRequestDraft,
  Tag,
  Bookmark,
  BookmarkCheck,
  Rocket,
  Terminal,
} from "lucide-react";

// ─── Calendar / Time ────────────────────────────────────────
export {
  Calendar as CalendarIcon,
  CalendarDays,
  CalendarClock,
  Clock,
  History,
} from "lucide-react";

// ─── Social / Reactions ─────────────────────────────────────
export {
  Star,
  Crown,
  Eye,
  EyeOff,
  Smile,
  SmilePlus,
} from "lucide-react";

// ─── System / Settings ──────────────────────────────────────
export {
  Settings,
  Settings2,
  SlidersHorizontal,
  Filter,
  Database,
  Layers,
  Sigma,
  ArrowDownWideNarrow,
  Percent,
  LogOut,
  Moon,
  Sun,
  Monitor,
  Keyboard,
  Globe,
  Languages,
  Shield,
  ShieldCheck,
  Bot,
  ShieldAlert,
  Lock,
  Key,
  Fingerprint,
  MemoryStick,
  Brain,
  Wrench,
} from "lucide-react";

// ─── Layout / UI ────────────────────────────────────────────
export {
  MoreHorizontal,
  MoreVertical,
  GripVertical,
  BarChart3,
  TrendingUp,
  TrendingDown,
  LayoutGrid,
  LayoutTemplate,
  Maximize,
  Minimize,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  Ellipsis,
  EllipsisVertical,
  Inbox,
  SquareUser,
  MonitorUp,
  MonitorOff,
} from "lucide-react";

// Boards (content v3, 11 Oct 2026): the library and the
// facilitation cluster's timer and vote.
export { Library, Timer, Vote } from "lucide-react";
// The AI panel's new chat (hub, 11 Oct 2026) uses SquarePen, exported with the shell's icons above.
// A doc image whose upload never finished (its placeholder, image/uploads.ts).
export { ImageOff } from "lucide-react";
// The doc's technical blocks (B3): the simple table, equations, find and replace, the word count. Replace is exported with B4's image icons above.
export { Table2, TableCellsMerge, TableCellsSplit, PanelTop, Radical, ReplaceAll, CaseSensitive, WholeWord, LetterText, WrapText, PaintBucket } from "lucide-react";
