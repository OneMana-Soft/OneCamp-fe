"use client";

import { memo, useEffect, useRef, useState, type ReactNode } from "react";
import { useDispatch } from "react-redux";
import * as Menu from "@radix-ui/react-dropdown-menu";
import { Bot, BellOff, ChevronDown, Columns2, Hash, Lock, MoreHorizontal, Plus } from "@/lib/icons";
import { openInSplit } from "@/store/slice/splitSlice";
import { paneFromHref } from "@/lib/split";
import { cn } from "@/lib/utils/helpers/cn";
import { IntentLink } from "@/components/navigationBar/desktop/IntentLink";
import type { DesktopChildrenNavType, DesktopNavType } from "@/types/nav";
import { DesktopNavigationChatAvatar } from "@/components/navigationBar/desktop/desktopNavigationChatAvatar";
import { DesktopNavigationEmojiStatus } from "@/components/navigationBar/desktop/desktopNavigationChatEmojiStatus";
import { formatCount } from "@/lib/utils/helpers/formatCount";
import { useMedia } from "@/context/MediaQueryContext";
import { hueFor } from "@/lib/campHue";
import { HUE_CLASS } from "@/components/ui/graphics/hues";
import { AgentAvatar, BotAvatar } from "@/components/ui/graphics";
import { BotTag } from "@/components/ui/botTag";
import { isAIBot } from "@/lib/botCopy";
import { useBotKindMap } from "@/hooks/useBotKinds";
import { destinationHue } from "@/lib/destinationHue";
import { lastInputWasPointer } from "@/lib/ui/inputModality";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * The sidebar's rows and sections (design v3, shell S5 to S11).
 *
 * One row for every kind of place: 30px, r8, padding 0 8, a 16px glyph, the
 * label at x = 40 (8 sidebar pad + 8 row pad + 16 glyph + 8 gap), 14px ink-2.
 * The current place is the raised chip (.nav-active: raised at e-sel, ink at
 * 510, its icon in the accent) and it never slides between rows. Channel and
 * doc glyphs are ink-3; only projects (tiles) and people (avatars) carry hue.
 * A plain unread is a 12px ink-3 count; only a DM or a mention earns the
 * filled brand badge, so a glance answers "does anyone need me?".
 */

/** A count that slides its digits when it changes (tabular, so the width holds). */
function Count({ value }: { value: number }) {
  return (
    <span className="shell-count" aria-hidden="true">
      <span key={value}>{formatCount(value)}</span>
    </span>
  );
}

/** The brand badge, springing in when it arrives, ringing once on a live arrival. */
export function Badge({ value, pulse }: { value: string | number; pulse?: boolean }) {
  return (
    <span className="shell-badge" data-pulse={pulse ? "true" : undefined} aria-hidden="true">
      {value}
    </span>
  );
}

/** Whether the row should fade its chip in: only when a pointer chose it. */
function useChipFade(active: boolean) {
  const [fade, setFade] = useState(false);
  const was = useRef(active);
  useEffect(() => {
    if (active && !was.current) setFade(lastInputWasPointer());
    if (!active) setFade(false);
    was.current = active;
  }, [active]);
  return fade;
}

/** A DM's 20px face: a person's avatar, an agent's square with the spark, a bot's neutral square. */
function Face({ item, botKinds }: { item: DesktopChildrenNavType; botKinds?: Record<string, string> }) {
  const p = item.userProfile;
  if (!p) return null;
  if (p.is_bot) {
    const agent = isAIBot(botKinds?.[p.user_uuid] ?? p.user_bot_kind);
    return (
      <span data-sidebar-avatar="" className="-mx-0.5 flex size-5 shrink-0">
        {agent ? <AgentAvatar /> : <BotAvatar><Bot /></BotAvatar>}
      </span>
    );
  }
  return (
    <span data-sidebar-avatar="" className="-mx-0.5 flex shrink-0">
      <DesktopNavigationChatAvatar userInfo={p} />
    </span>
  );
}

/** Two overlapping 16px faces for a group conversation, in the icon column. */
function GroupFaces({ people }: { people: NonNullable<DesktopChildrenNavType["userParticipants"]> }) {
  return (
    <span data-sidebar-avatar="" data-group-faces="" className="-mx-[3px] flex w-[22px] shrink-0 items-center">
      {people.slice(0, 2).map((p, i) => (
        <span key={p.user_uuid} className={cn("flex size-4 shrink-0 rounded-full shell-frame-ring [&_.presence-dot]:hidden [&_[class*='h-7']]:!size-4", i > 0 && "-ml-2.5")}>
          <DesktopNavigationChatAvatar userInfo={p} />
        </span>
      ))}
    </span>
  );
}

/** A project's 16px tile: its own hue's avatar cut, the first letter in white. */
export function ProjectTile({ uuid, name }: { uuid: string; name: string }) {
  return (
    <span className={cn("shell-ptile", HUE_CLASS[hueFor(uuid)])} aria-hidden="true">
      {(name.trim()[0] || "?").toUpperCase()}
    </span>
  );
}

export const SideNavLink = memo(({ ch }: { ch: DesktopChildrenNavType }) => {
  const { isMobile } = useMedia();
  const isActive = ch.variant === "sidebarActive";
  const unread = ch.unread_count && ch.unread_count > 0 ? ch.unread_count : 0;
  const dispatch = useDispatch();
  const fade = useChipFade(isActive);
  const botKinds = useBotKindMap();
  // Channels, chats, docs and projects can open beside the page (split view).
  const pane = !isMobile ? paneFromHref(String(ch.path || "")) : null;

  let glyph: ReactNode = null;
  if (ch.project_uuid) glyph = <ProjectTile uuid={ch.project_uuid} name={ch.title} />;
  else if (ch.userParticipants && ch.userParticipants.length > 1) glyph = <GroupFaces people={ch.userParticipants} />;
  else if (ch.userProfile) glyph = <Face item={ch} botKinds={botKinds} />;
  else {
    const Icon = ch.isPrivate ? Lock : ch.icon ?? Hash;
    glyph = <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />;
  }

  return (
    <div className="group/row relative">
      <IntentLink
        href={`${ch.path}`}
        scroll={false}
        aria-current={isActive ? "page" : undefined}
        data-unread={unread && !ch.muted ? "true" : undefined}
        data-muted={ch.muted ? "true" : undefined}
        data-fade={fade ? "true" : undefined}
        className={cn("shell-row", isActive ? "nav-active" : "nav-idle")}
      >
        {glyph}
        {/* A person's name keeps their own casing: never capitalised. */}
        <span className="min-w-0 flex-1 truncate">{ch.title}</span>
        {/* An agent carries the Agent tag; a bot of another kind says Bot. */}
        {ch.userProfile?.is_bot && <BotTag userUUID={ch.userProfile.user_uuid} />}
        {ch.isCallActive && <span className="shell-call-dot" aria-label="Call in progress" role="img" />}
        {ch.muted ? (
          <BellOff className="h-3 w-3 shrink-0 text-ink-4" aria-label="Muted" />
        ) : unread ? (
          ch.badge ? <Badge value={formatCount(unread)} /> : <Count value={unread} />
        ) : null}
        {ch.userProfile && !ch.userProfile.is_bot && <DesktopNavigationEmojiStatus userUUID={ch.userProfile.user_uuid} />}
        {unread > 0 && <span className="sr-only">, {unread} unread</span>}
      </IntentLink>
      {pane && (
        <button
          type="button"
          onClick={() => dispatch(openInSplit(pane))}
          aria-label={`Open ${ch.title} side by side`}
          title="Open side by side (Alt + click)"
          className="shell-split-btn"
        >
          <Columns2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
});
SideNavLink.displayName = "SideNavLink";

/** One of the four primary rows: a destination with an optional count or badge. */
const PrimaryRow = memo(({ link, inboxPulse }: { link: DesktopNavType; inboxPulse?: boolean }) => {
  const isActive = link.variant === "sidebarActive";
  const fade = useChipFade(isActive);
  const n = Number(String(link.label || "").replace(/\D/g, "")) || 0;
  // Inbox earns the brand badge (mentions, assignments, urgent nudges); a
  // row's other numbers (tasks due, reminders come) are quiet counts.
  const asBadge = link.title === "Inbox";
  return (
    <IntentLink
      href={`${link.path}`}
      scroll={false}
      aria-current={isActive ? "page" : undefined}
      data-fade={fade ? "true" : undefined}
      className={cn("shell-row", isActive ? "nav-active" : "nav-idle")}
    >
      {link.icon && <link.icon className="h-4 w-4 shrink-0" aria-hidden="true" />}
      <span className="min-w-0 flex-1 truncate">{link.title}</span>
      {link.label ? (asBadge ? <Badge value={link.label} pulse={inboxPulse} /> : <Count value={n} />) : null}
      {link.label ? <span className="sr-only">, {link.label}</span> : null}
    </IntentLink>
  );
});
PrimaryRow.displayName = "PrimaryRow";

/**
 * More (S5): a popover from the row's right side holding every page that
 * isn't daily, each on its hue tile. Not an in-place fold.
 */
function MoreRow({ links }: { links: DesktopNavType[] }) {
  const current = links.find((l) => l.variant === "sidebarActive");
  return (
    <Menu.Root modal={false}>
      <Menu.Trigger asChild>
        <button
          type="button"
          aria-label={current ? `More, on ${current.title}` : "More"}
          className="shell-row nav-idle w-full text-left !text-ink-3 data-[state=open]:bg-press"
        >
          <MoreHorizontal className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">More</span>
          {current && <span className="shell-count">{current.title}</span>}
        </button>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content side="right" align="start" sideOffset={6} aria-label="More places" className="shell-menu shell-pop z-[var(--z-dropdown)] !w-56">
          {links.map((l) => {
            const hue = destinationHue(String(l.path || "").split("?")[0]);
            return (
              <Menu.Item key={l.title} asChild className="shell-menu-item">
                <IntentLink href={`${l.path}`} aria-current={l.variant === "sidebarActive" ? "page" : undefined}>
                  <span className={cn(HUE_CLASS[hue], "grid size-5 shrink-0 place-items-center rounded-[6px] bg-hue-tint text-hue [&>svg]:size-3")} aria-hidden="true">
                    {l.icon && <l.icon />}
                  </span>
                  <span className={cn("flex-1 truncate", l.variant === "sidebarActive" && "font-medium")}>{l.title}</span>
                </IntentLink>
              </Menu.Item>
            );
          })}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}

/** The four primary rows and More. */
export function PrimaryNav({ links, more, inboxPulse }: { links: DesktopNavType[]; more: DesktopNavType[]; inboxPulse?: boolean }) {
  return (
    <nav aria-label="Main" className="flex flex-col gap-px">
      {links.map((l) => (
        <PrimaryRow key={l.title} link={l} inboxPulse={l.title === "Inbox" ? inboxPulse : undefined} />
      ))}
      {more.length > 0 && <MoreRow links={more} />}
    </nav>
  );
}

interface SectionProps {
  title: string;
  open: boolean;
  setOpen: (open: boolean) => void;
  /** The + at the right (create a project, channel, conversation). */
  onAdd?: () => void;
  addLabel?: string;
  /** Where the heading itself goes (Projects opens every project). */
  href?: string;
  rows: DesktopChildrenNavType[];
  /** The first-run row shown in place of an empty section. */
  invite?: { label: string; onClick: () => void };
  /** At most this many rows, the rest behind "Show N more". */
  cap?: number;
}

/**
 * A section (S7): a 28px header, 14px above, 12/510 ink-3 in sentence case.
 * The heading toggles it (or, for Projects, opens every project, with the
 * toggle beside); "+" shows on sidebar hover. A collapsed section shows its
 * unread total, as a badge if it holds a DM. An empty section is never a bare
 * header: it shows one quiet invite row. Collapse is instant.
 */
export function SidebarSection({ title, open, setOpen, onAdd, addLabel, href, rows, invite, cap }: SectionProps) {
  const [showAll, setShowAll] = useState(false);
  if (rows.length === 0 && !invite) return null;
  const unread = rows.reduce((n, r) => n + (r.muted ? 0 : r.unread_count || 0), 0);
  const badge = rows.some((r) => r.badge && (r.unread_count || 0) > 0);
  const capped = !!cap && !showAll && rows.length > cap;
  const visible = capped ? rows.slice(0, cap) : rows;
  // The current place is never hidden behind "Show more".
  const hiddenActive = capped ? rows.slice(cap).find((r) => r.variant === "sidebarActive") : undefined;
  const label = (
    <>
      <span className="truncate">{title}</span>
      {!open && unread > 0 && (badge ? <Badge value={formatCount(unread)} /> : <span className="shell-count">{formatCount(unread)}</span>)}
    </>
  );

  return (
    <section aria-label={title} data-section={title}>
      <div className="shell-sect">
        {href ? (
          <>
            <IntentLink href={href} className="shell-sect-btn">{label}</IntentLink>
            <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={open ? `Hide ${title.toLowerCase()}` : `Show ${title.toLowerCase()}`} className="shell-icon-btn shell-sect-plus" data-size="24">
              <ChevronDown className={cn("h-3.5 w-3.5", !open && "-rotate-90")} aria-hidden="true" />
            </button>
          </>
        ) : (
          <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="shell-sect-btn">
            {label}
          </button>
        )}
        {onAdd && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" onClick={onAdd} aria-label={addLabel ?? `Add ${title.toLowerCase()}`} className="shell-icon-btn shell-sect-plus" data-size="24">
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">{addLabel ?? `Add ${title.toLowerCase()}`}</TooltipContent>
          </Tooltip>
        )}
      </div>
      {open && (
        <div className="shell-sect-rows flex flex-col gap-px" data-instant={lastInputWasPointer() ? undefined : "true"}>
          {rows.length === 0 && invite ? (
            <button type="button" onClick={invite.onClick} className="shell-row nav-idle w-full text-left !text-ink-3">
              <span className="shell-ptile" data-invite="" aria-hidden="true"><Plus /></span>
              <span className="truncate">{invite.label}</span>
            </button>
          ) : (
            <>
              {visible.map((r) => <SideNavLink key={r.path} ch={r} />)}
              {hiddenActive && <SideNavLink key={hiddenActive.path} ch={hiddenActive} />}
              {!!cap && rows.length > cap && (
                <button type="button" onClick={() => setShowAll(!showAll)} className="shell-row nav-idle w-full text-left !text-2xs !font-medium !text-ink-3">
                  <span className="w-4 shrink-0" aria-hidden="true" />
                  {showAll ? "Show fewer" : `Show ${rows.length - cap} more`}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
