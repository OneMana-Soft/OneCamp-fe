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
import { rowSignal, sectionSignal } from "@/lib/nav/sidebarSignal";
import { useHeldOrder } from "@/lib/nav/heldOrder";
import { useMedia } from "@/context/MediaQueryContext";
import { ProjectTile } from "@/components/ui/graphics/ProjectTile";
import { HUE_CLASS } from "@/components/ui/graphics/hues";
import { AgentAvatar, BotAvatar } from "@/components/ui/graphics";
import { BotTag } from "@/components/ui/botTag";
import { isAIBot } from "@/lib/botCopy";
import { useBotKindMap } from "@/hooks/useBotKinds";
import { destinationHue } from "@/lib/destinationHue";
import { lastInputWasPointer, returnFocusOnlyForKeys } from "@/lib/ui/inputModality";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * The sidebar's rows and sections (design v3, shell S5 to S11).
 *
 * One row for every kind of place: 30px, r8, padding 0 8, a 16px glyph, the
 * label at x = 40 (8 sidebar pad + 8 row pad + 16 glyph + 8 gap), 14px ink-2.
 * The current place is the raised chip (.nav-active: raised at e-sel, ink at
 * 510, its icon in the accent) and it never slides between rows. Channel and
 * doc glyphs are ink-3; only projects (tiles) and people (avatars) carry hue.
 * An unread channel is bold with no number; only a DM's count or a mention
 * of you ("@2") earns the filled brand badge, so a glance answers "does
 * anyone need me?" (lib/nav/sidebarSignal).
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

export const SideNavLink = memo(({ ch }: { ch: DesktopChildrenNavType }) => {
  const { isMobile } = useMedia();
  const isActive = ch.variant === "sidebarActive";
  const signal = rowSignal(ch);
  const dispatch = useDispatch();
  const fade = useChipFade(isActive);
  const botKinds = useBotKindMap();
  // Channels, chats, docs and projects can open beside the page (split view).
  const pane = !isMobile ? paneFromHref(String(ch.path || "")) : null;

  let glyph: ReactNode = null;
  if (ch.project_uuid) glyph = <ProjectTile id={ch.project_uuid} />;
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
        data-unread={signal.unread ? "true" : undefined}
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
        {ch.muted && <BellOff className="h-3 w-3 shrink-0 text-ink-3" aria-label="Muted" />}
        {signal.badge && <Badge value={signal.badge} />}
        {ch.userProfile && !ch.userProfile.is_bot && <DesktopNavigationEmojiStatus userUUID={ch.userProfile.user_uuid} />}
        {signal.spoken && <span className="sr-only">{signal.spoken}</span>}
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
 * More (S5): a popover from its trigger's right side holding every page that
 * isn't daily, each on its hue tile. Not an in-place fold. The sidebar's
 * More row opens it, and so does the rail's More, so the rail reaches every
 * page the sidebar does.
 */
export function MorePopover({ links, children }: { links: DesktopNavType[]; children: ReactNode }) {
  return (
    <Menu.Root modal={false}>
      <Menu.Trigger asChild>{children}</Menu.Trigger>
      <Menu.Portal>
        <Menu.Content side="right" align="start" sideOffset={6} collisionPadding={8} aria-label="More places" onCloseAutoFocus={returnFocusOnlyForKeys} className="shell-menu shell-pop z-[var(--z-dropdown)] !w-56">
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

/**
 * The sidebar's More row: the current place's name beside it when it lives in
 * More, on the selected chip the primary rows wear (QA F-31). A grey name on an
 * idle row didn't read as where you are.
 */
function MoreRow({ links }: { links: DesktopNavType[] }) {
  const current = links.find((l) => l.variant === "sidebarActive");
  const fade = useChipFade(!!current);
  return (
    <MorePopover links={links}>
      <button
        type="button"
        aria-label={current ? `More, on ${current.title}` : "More"}
        data-fade={fade ? "true" : undefined}
        className={cn("shell-row w-full text-left data-[state=open]:bg-press", current ? "nav-active" : "nav-idle !text-ink-3")}
      >
        <MoreHorizontal className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">More</span>
        {current && <span className="shell-count">{current.title}</span>}
      </button>
    </MorePopover>
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
  /** No header and never folded: the list's own title already names it (the tablet's channel list). */
  bare?: boolean;
}

/**
 * A section (S7): a 28px header, 14px above, 12/510 ink-3 in sentence case.
 * The heading toggles it (or, for Projects, opens every project, with the
 * toggle beside); "+" shows on sidebar hover. A collapsed section shows the
 * brand badge if a row in it has one (its DMs' unread, or "@" its mentions),
 * else a dot when anything in it is unread. An empty section is never a bare
 * header: it shows one quiet invite row. Collapse is instant.
 */
const rowKey = (r: DesktopChildrenNavType) => r.path;

export function SidebarSection({ title, open: openProp, setOpen, onAdd, addLabel, href, rows: liveRows, invite, cap, bare = false }: SectionProps) {
  const [showAll, setShowAll] = useState(false);
  const open = bare || openProp;
  // A row never moves under the pointer: DMs follow their latest message,
  // and one that moved waits until the pointer leaves or rests (F-17).
  const { rows, handlers: holdOrder } = useHeldOrder(liveRows, rowKey);
  if (rows.length === 0 && !invite) return null;
  const signal = sectionSignal(rows);
  const capped = !!cap && !showAll && rows.length > cap;
  const visible = capped ? rows.slice(0, cap) : rows;
  // The current place is never hidden behind "Show more".
  const hiddenActive = capped ? rows.slice(cap).find((r) => r.variant === "sidebarActive") : undefined;
  const label = (
    <>
      <span className="truncate">{title}</span>
      {!open && (signal.badge ? <Badge value={signal.badge} /> : signal.unread ? <span className="shell-dot" aria-hidden="true" /> : null)}
      {!open && signal.spoken && <span className="sr-only">{signal.spoken}</span>}
    </>
  );

  return (
    <section aria-label={title} data-section={title}>
      {!bare && <div className="shell-sect">
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
      </div>}
      {open && (
        <div className="shell-sect-rows flex flex-col gap-px" data-instant={lastInputWasPointer() ? undefined : "true"} {...holdOrder}>
          {rows.length === 0 && invite ? (
            <button type="button" onClick={invite.onClick} className="shell-row nav-idle w-full text-left !text-ink-3">
              <span className="shell-invite-tile" aria-hidden="true"><Plus /></span>
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
