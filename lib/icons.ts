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
export { ArrowLeftRight, Columns2 } from "lucide-react";
// A project's timeline tab, and its Unscheduled list.
export { ChartGantt, CalendarOff, CirclePlus } from "lucide-react";
// Goals: the view, a goal's page and its link from a project.
export { Target } from "lucide-react";
// Calls: the captions toggle (hub, 10 Oct 2026).
export { Captions, CaptionsOff } from "lucide-react";
// Single sign-on on the sign-in page: the organisation's own way in.
export { Building2 } from "lucide-react";
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
  Send,
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
  Fingerprint,
  CircleStop,
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
  ClipboardCheck,
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
  Mail,
  MailPlus,
  AtSign,
  Reply,
  Forward,
  Share,
  Share2,
  MessageSquareText,
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
  Zap,
  Lightbulb,
  Workflow,
  Network,
  Smartphone,
  Command,
  Eraser,
  Activity,
} from "lucide-react";

// ─── Media / Files ──────────────────────────────────────────
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
  CalendarClock,
  Rocket,
  Terminal,
} from "lucide-react";

// ─── Calendar / Time ────────────────────────────────────────
export {
  Calendar as CalendarIcon,
  CalendarDays,
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
  Filter,
  Database,
  Sigma,
  LogOut,
  Moon,
  Sun,
  Monitor,
  Keyboard,
  Globe,
  Languages,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Lock,
  Key,
  Brain,
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
