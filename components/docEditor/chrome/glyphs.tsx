"use client"

import type { LucideIcon } from "lucide-react"
import {
  BarChart3, Bookmark, Box, Brain, Calendar, ClipboardList, Code, Coins, Crown, Database, FileText, Flag, Folder, Globe, Heart, Home,
  Inbox, Kanban, Key, Layers, Library, Lightbulb, Mail, Megaphone, Milestone, Moon, Presentation, Rocket, Route, ScrollText, Shield,
  Sparkles, Star, Sun, Target, Terminal, Users, Workflow, Wrench, Zap,
} from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"

/**
 * OneCamp's page glyphs (D-2): the icons a page can wear instead of an emoji,
 * stored as "glyph:<name>" or "glyph:<name>:<colour>". Named the way a person
 * would look for them; the picker's search reads the words too.
 */
export const GLYPHS: { name: string; icon: LucideIcon; words: string }[] = [
  { name: "file-text", icon: FileText, words: "page doc note" },
  { name: "library", icon: Library, words: "wiki books handbook" },
  { name: "scroll", icon: ScrollText, words: "policy rules spec" },
  { name: "rocket", icon: Rocket, words: "launch release ship" },
  { name: "target", icon: Target, words: "goal okr aim" },
  { name: "flag", icon: Flag, words: "milestone report" },
  { name: "milestone", icon: Milestone, words: "roadmap plan" },
  { name: "lightbulb", icon: Lightbulb, words: "idea brainstorm" },
  { name: "sparkles", icon: Sparkles, words: "new magic" },
  { name: "calendar", icon: Calendar, words: "meeting schedule date" },
  { name: "users", icon: Users, words: "team people" },
  { name: "megaphone", icon: Megaphone, words: "announcement news marketing" },
  { name: "presentation", icon: Presentation, words: "slides pitch deck" },
  { name: "kanban", icon: Kanban, words: "board tasks" },
  { name: "clipboard", icon: ClipboardList, words: "checklist list" },
  { name: "chart", icon: BarChart3, words: "metrics data report" },
  { name: "code", icon: Code, words: "engineering dev" },
  { name: "terminal", icon: Terminal, words: "command ops runbook" },
  { name: "database", icon: Database, words: "data schema" },
  { name: "workflow", icon: Workflow, words: "process flow" },
  { name: "route", icon: Route, words: "journey path" },
  { name: "wrench", icon: Wrench, words: "tools fix maintenance" },
  { name: "shield", icon: Shield, words: "security safety" },
  { name: "key", icon: Key, words: "access secret" },
  { name: "layers", icon: Layers, words: "design stack" },
  { name: "box", icon: Box, words: "product package" },
  { name: "globe", icon: Globe, words: "world web public" },
  { name: "home", icon: Home, words: "start welcome" },
  { name: "folder", icon: Folder, words: "files archive" },
  { name: "inbox", icon: Inbox, words: "requests intake" },
  { name: "mail", icon: Mail, words: "email letter" },
  { name: "brain", icon: Brain, words: "thinking research" },
  { name: "crown", icon: Crown, words: "leadership vip" },
  { name: "coins", icon: Coins, words: "money budget finance" },
  { name: "heart", icon: Heart, words: "love health culture" },
  { name: "star", icon: Star, words: "favourite important" },
  { name: "bookmark", icon: Bookmark, words: "reading saved" },
  { name: "zap", icon: Zap, words: "fast energy" },
  { name: "sun", icon: Sun, words: "day summer" },
  { name: "moon", icon: Moon, words: "night" },
]

/** The colours a glyph can wear: B2's doc colour names (lib/docColours), with gray as ink. */
export const HUES: { name: string; label: string }[] = [
  { name: "gray", label: "Grey" },
  { name: "sun", label: "Yellow" },
  { name: "moss", label: "Green" },
  { name: "lake", label: "Teal" },
  { name: "sky", label: "Blue" },
  { name: "dusk", label: "Purple" },
  { name: "berry", label: "Red" },
]

const byName = new Map(GLYPHS.map((g) => [g.name, g.icon]))

/** A glyph's ink: its colour's, or ink-2. */
export const hueInk = (hue?: string) => (hue && hue !== "gray" && HUES.some((h) => h.name === hue) ? `var(--camp-${hue}-ink)` : "var(--ink-2)")

export default function DocGlyph({ name, hue, size = 16, className }: { name: string; hue?: string; size?: number; className?: string }) {
  const Icon = byName.get(name) ?? FileText
  return <Icon aria-hidden="true" data-doc-icon="glyph" className={cn("shrink-0", className)} style={{ width: size, height: size, color: hueInk(hue) }} />
}
