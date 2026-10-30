"use client";

import { Fragment, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { format, startOfDay } from "date-fns";
import { Calendar as CalendarIcon, Clock, ListTodo, Moon, UserPlus, X } from "@/lib/icons";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { anchorTo } from "@/components/ui/anchor";
import { BesideBlockContent } from "@/components/ui/besideBlock";
import { Calendar } from "@/components/ui/calendar";
import { TimeList } from "@/components/ui/date-time-picker";
import { PeoplePicker, type PickedPerson } from "@/components/common/peoplePicker";
import { Button } from "@/components/ui/button";
import { usePost } from "@/hooks/usePost";
import { useDebounce } from "@/hooks/useDebounce";
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints";
import { IdentityMark } from "@/components/ui/graphics/IdentityMark";
import { StatusGlyph } from "@/components/ui/graphics/glyphs";
import { HUE_CLASS } from "@/components/ui/graphics/hues";
import { taskGlyphStatus } from "@/components/calendar/HueBlock";
import { PickTask } from "@/components/task/lazyTaskFinder";
import { FEATURE_CALENDAR_REPEATS, useFeature } from "@/hooks/useClientConfig";
import { blockDueBy, blockTaskOf } from "@/lib/calendar/taskBlock";
import { projectHue } from "@/lib/projectHue";
import { OWN_HUE } from "@/components/calendar/calendarTones";
import { cn } from "@/lib/utils/helpers/cn";
import { displayNameOf } from "@/lib/personName";
import { parseEventText, type ParsedEvent } from "@/lib/calendar/parseEventText";
import { foldName, matchName, type GuestCandidate, type NameMatch } from "@/lib/calendar/guestMatch";
import { avatarSeed } from "@/lib/utils/getAvatarColor";
import type { CalendarEventTask, CreateEventPayload } from "@/types/calendar";
import type { ChannelAndUserListInterfaceResp } from "@/types/user";
import type { CalendarDraft } from "@/components/calendar/weekView";
import { clockTime } from "@/lib/utils/date/clock";

/**
 * Quick create (content.md C14): a 340 px pop card anchored to the draft's
 * ghost, which stays on the grid. The title reads natural language as you
 * type ("Lunch with Maya at 1pm tomorrow"), underlines what it understood and
 * moves the ghost to it; chips under it open the pickers. "More options"
 * carries everything into the full dialog. Escape discards the ghost. Where
 * the calendar keeps its own events, the Task chip makes the slot time for
 * one of your tasks (B1): the block has no guests and isn't focus time.
 */
export interface QuickCreateValues {
  title: string;
  start: Date;
  end: Date;
  isFocus: boolean;
  guests: PickedPerson[];
  /** Time for this task: a task block, not an event. */
  task?: CalendarEventTask | null;
}

interface QuickCreateCardProps {
  draft: CalendarDraft | null;
  /** What the card opened from: the month cell, or the all-day button. A timed draft's ghost comes first (draftAnchorOf). */
  anchor: HTMLElement | null;
  onDraftChange: (draft: CalendarDraft) => void;
  onClose: () => void;
  onCreated: () => void;
  onMoreOptions: (values: QuickCreateValues) => void;
  /** Makes the draft's time a block for the task (the calendar's one block write), named as typed or for the task; true once made. */
  onBlockTime?: (task: CalendarEventTask, start: Date, end: Date, title: string) => Promise<boolean>;
}

/**
 * Where a draft's card stands (components/ui/anchor): by the draft's ghost as
 * the grid draws it now, else the cell or button it opened from, else the
 * draft's day as the month draws it now. Measured on each ask: the ghost a
 * drag drew unmounts as the drag ends and comes back once the draft is set,
 * and a parse moves it, so an element held from either measured (0, 0) and
 * the card stood in the screen's top-left corner.
 */
export function draftAnchorOf(draft: CalendarDraft | null, opened: HTMLElement | null) {
  return anchorTo(
    () => document.querySelector("[data-calendar] [data-calendar-ghost]"),
    () => (opened?.isConnected ? opened : draft ? document.querySelector(`[data-month-day="${startOfDay(draft.start).toISOString()}"]`) : null),
  );
}

const chip =
  "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-md bg-hover px-2 text-meta font-medium text-ink-2 ring-1 ring-inset ring-line outline-none transition-colors hover:bg-press hover:text-ink focus-visible:ring-2 focus-visible:ring-brand [&_svg]:size-3";
/** A person named in the title: a chip that holds its own buttons. */
const nameChip = "inline-flex min-h-6 max-w-full shrink-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-md bg-hover px-2 py-0.5 text-meta font-medium text-ink-2 ring-1 ring-inset ring-line [&_svg]:size-3";
const chipButton = "inline-flex items-center rounded-[4px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand";

export function QuickCreateCard({ draft, anchor, onDraftChange, onClose, onCreated, onMoreOptions, onBlockTime }: QuickCreateCardProps) {
  const [text, setText] = useState("");
  const [focus, setFocus] = useState(false);
  const [guests, setGuests] = useState<PickedPerson[]>([]);
  const [picker, setPicker] = useState<null | "date" | "time" | "guests" | "task">(null);
  // The task this time is for, once one is picked; and its block on its way.
  const [task, setTask] = useState<CalendarEventTask | null>(null);
  const [blocking, setBlocking] = useState(false);
  const canBlock = useFeature(FEATURE_CALENDAR_REPEATS) && !!onBlockTime;
  // The people named after "with": what each name came to, and what the
  // person decided (someone picked, or null: nobody for that name).
  const [lookups, setLookups] = useState<Record<string, NameMatch>>({});
  const [decided, setDecided] = useState<Record<string, GuestCandidate | null>>({});
  const inputRef = useRef<HTMLInputElement>(null);
  const post = usePost();
  // Its own, so a lookup never greys out Save.
  const lookup = usePost();
  // The draft the card opened on (or a chip last set): what the parse adjusts from.
  const base = useRef<CalendarDraft | null>(draft);
  const wasOpen = useRef(!!draft);
  useEffect(() => {
    if (draft && !wasOpen.current) base.current = draft;
    if (!draft) {
      setText("");
      setFocus(false);
      setGuests([]);
      setPicker(null);
      setTask(null);
      setLookups({});
      setDecided({});
      base.current = null;
    }
    wasOpen.current = !!draft;
  }, [draft]);

  const parsed: ParsedEvent = useMemo(() => parseEventText(text), [text]);

  // The parse moves the ghost (float-follow: the card follows its anchor).
  useEffect(() => {
    const b = base.current;
    if (!b || !draft || b.allDay) return;
    if (!parsed.date && parsed.startMinutes === undefined && parsed.durationMinutes === undefined) return;
    const day = parsed.date ?? b.start;
    const minutes = parsed.startMinutes ?? b.start.getHours() * 60 + b.start.getMinutes();
    const len = parsed.durationMinutes ?? Math.round((b.end.getTime() - b.start.getTime()) / 60000);
    const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(minutes / 60), minutes % 60);
    const end = new Date(start.getTime() + len * 60000);
    if (start.getTime() !== draft.start.getTime() || end.getTime() !== draft.end.getTime()) onDraftChange({ start, end });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed.date?.getTime(), parsed.startMinutes, parsed.durationMinutes]);

  const isFocus = !task && (focus || parsed.focus);
  const title = parsed.title || (isFocus ? "Focus time" : "");

  // Each name after "with" is looked up while it is typed, once, and the card
  // shows who it came to (CAL-BUG-10). Save never looks anyone up.
  const named = useMemo(() => {
    const seen = new Set<string>();
    return parsed.people.filter((n) => {
      const k = foldName(n);
      return !!k && !seen.has(k) && !!seen.add(k);
    });
  }, [parsed.people]);
  const settledNames = useDebounce(named.join("\u0000"), 250);
  useEffect(() => {
    if (!draft || !settledNames) return;
    for (const name of settledNames.split("\u0000")) {
      const k = foldName(name);
      if (lookups[k]) continue;
      setLookups((cur) => ({ ...cur, [k]: { state: "looking" } }));
      lookup
        .makeRequest<{ search_text: string }, ChannelAndUserListInterfaceResp[]>({ apiEndpoint: PostEndpointUrl.SearchUserAndChannel, payload: { search_text: name }, quiet: true })
        .then((res) => {
          const hits = (Array.isArray(res) ? res : []).filter((r) => r.user_uuid).map((r) => ({ uuid: r.user_uuid, name: displayNameOf(r) || "Someone", avatarKey: r.user_profile_object_key || undefined }));
          setLookups((cur) => ({ ...cur, [k]: matchName(name, hits) }));
        })
        .catch(() => setLookups((cur) => ({ ...cur, [k]: { state: "failed" } })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per settled list of names
  }, [settledNames, !!draft]);

  // Who each name invites: the one picked, or the one found, unless set aside.
  const namedPeople = named.map((name) => {
    const k = foldName(name);
    const choice = decided[k];
    const match: NameMatch = lookups[k] ?? { state: "looking" };
    const person = choice === null ? null : choice ?? (match.state === "found" ? match.person : null);
    return { key: k, name, match, person, setAside: choice === null };
  });
  const invited = useMemo(() => {
    const out = new Map<string, PickedPerson>();
    for (const g of guests) out.set(g.uuid, g);
    for (const n of namedPeople) if (n.person) out.set(n.person.uuid, { uuid: n.person.uuid, name: n.person.name });
    return [...out.values()];
    // eslint-disable-next-line react-hooks/exhaustive-deps -- namedPeople is derived from these
  }, [guests, named, lookups, decided]);

  const values = (): QuickCreateValues | null =>
    draft ? { title, start: draft.start, end: draft.end, isFocus, guests: task ? [] : invited, task } : null;

  const save = async () => {
    const v = values();
    if (v?.task && onBlockTime) {
      // Time for a task: named as typed, else for its task.
      if (blocking) return;
      setBlocking(true);
      const made = await onBlockTime(v.task, v.start, v.end, parsed.title.trim()).catch(() => false);
      setBlocking(false);
      if (made) onClose();
      return;
    }
    if (!v || !v.title.trim()) {
      inputRef.current?.focus();
      return;
    }
    // Only the people the card shows: a name still being looked up, or one
    // that asks who, invites nobody.
    const participants = v.guests.map((g) => g.uuid);
    const res = await post.makeRequest<CreateEventPayload>({
      apiEndpoint: PostEndpointUrl.CreateCalendarEvent,
      payload: {
        title: v.title.trim(),
        startTime: v.start.toISOString(),
        endTime: v.end.toISOString(),
        participants,
        isFocus: v.isFocus,
        isAway: false,
      },
      showErrorToast: true,
    });
    if (res !== undefined) onCreated();
  };

  // The underline of what the parse read, drawn under the input's own text.
  const mirror = useMemo(() => {
    const out: React.ReactNode[] = [];
    let i = 0;
    parsed.spans.forEach((s, k) => {
      if (s.start > i) out.push(text.slice(i, s.start));
      out.push(
        <span key={k} className="underline decoration-brand/40 decoration-1 underline-offset-4">
          {text.slice(s.start, s.end)}
        </span>,
      );
      i = s.end;
    });
    out.push(text.slice(i));
    return out;
  }, [parsed.spans, text]);

  const open = !!draft;
  const allDay = !!draft?.allDay;
  const timeLabel = draft
    ? allDay
      ? "All day"
      : `${clockTime(draft.start)} – ${clockTime(draft.end)}`
    : "";
  const dateLabel = draft
    ? allDay && draft.end.getTime() - draft.start.getTime() > 86_400_000
      ? `${format(draft.start, "d")}–${format(new Date(draft.end.getTime() - 1), "d MMM")}`
      : format(draft.start, "EEE d MMM")
    : "";

  // Measured on each ask, and made again when the draft moves, so the card follows its ghost.
  const at = useMemo(
    () => ({ current: draftAnchorOf(draft, anchor) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the draft's times move the ghost
    [anchor, draft?.start.getTime(), draft?.end.getTime()],
  );

  // Time for a task: either face of the task chip opens your tasks, due by the draft's day.
  const pickTask = (start: Date, opener: ReactElement) => (
    <PickTask
      dueBy={blockDueBy(start)}
      open={picker === "task"}
      onOpenChange={(o) => setPicker(o ? "task" : null)}
      onPick={(t) => {
        setTask(blockTaskOf(t));
        inputRef.current?.focus();
      }}
    >
      {opener}
    </PickTask>
  );

  return (
    <Popover open={open} onOpenChange={(o) => !o && onClose()}>
      <PopoverAnchor virtualRef={at} />
      <BesideBlockContent
        at={at.current}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          inputRef.current?.focus();
        }}
        className="content-float w-[340px] rounded-xl bg-pop p-0 shadow-e3"
        aria-label="New event"
        data-quick-create=""
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
          className="flex flex-col"
        >
          <div className="relative px-4 pt-4">
            <div aria-hidden="true" className="pointer-events-none absolute inset-x-4 top-4 whitespace-pre text-body text-transparent">
              {mirror}
            </div>
            <input
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={task ? task.task_name || "Time for a task" : "Lunch with Maya at 1pm tomorrow"}
              aria-label="Event title"
              className="relative w-full bg-transparent text-body text-ink outline-none placeholder:text-ink-3"
            />
          </div>
          {!task && namedPeople.some((n) => !n.setAside) ? (
            <ul className="flex flex-wrap gap-1.5 px-4 pt-2.5" aria-label="People named" data-named-people="">
              {namedPeople.map((n) =>
                n.setAside ? null : (
                  <li key={n.key} className="flex max-w-full">
                    {n.person ? (
                      <span className={cn(nameChip, "pr-1")} data-guest="invited">
                        <IdentityMark
                          variant="avatar"
                          size={16}
                          id={avatarSeed(n.person.name)}
                          label={n.person.name}
                          src={n.person.avatarKey ? `${GetEndpointUrl.PublicAttachmentURL}?objKey=${n.person.avatarKey}` : undefined}
                        />
                        <span className="max-w-[11rem] truncate text-ink">{n.person.name}</span>
                        <button type="button" aria-label={`Don't invite ${n.person.name}`} onClick={() => setDecided((d) => ({ ...d, [n.key]: null }))} className={cn(chipButton, "size-5 justify-center text-ink-3 hover:bg-press hover:text-ink")}>
                          <X aria-hidden="true" />
                        </button>
                      </span>
                    ) : n.match.state === "choose" ? (
                      <span role="group" aria-label={`Who is ${n.name}?`} className={cn(nameChip, "pr-1")} data-guest="choose">
                        <span className="text-ink">{n.name}?</span>
                        {n.match.options.map((o, i) => (
                          <Fragment key={o.uuid}>
                            {i > 0 ? <span aria-hidden="true" className="text-ink-4">·</span> : null}
                            <button type="button" onClick={() => setDecided((d) => ({ ...d, [n.key]: o }))} className={cn(chipButton, "px-0.5 text-brand-text hover:underline")}>
                              {o.name}
                            </button>
                          </Fragment>
                        ))}
                        <button type="button" aria-label={`Invite nobody for ${n.name}`} onClick={() => setDecided((d) => ({ ...d, [n.key]: null }))} className={cn(chipButton, "size-5 justify-center text-ink-3 hover:bg-press hover:text-ink")}>
                          <X aria-hidden="true" />
                        </button>
                      </span>
                    ) : (
                      <span className={cn(nameChip, "text-ink-3")} aria-busy={n.match.state === "looking" || undefined} data-guest={n.match.state}>
                        {n.match.state === "none" ? `No one called ${n.name}` : n.match.state === "failed" ? `Couldn't look up ${n.name}` : `Finding ${n.name}…`}
                      </span>
                    )}
                  </li>
                ),
              )}
            </ul>
          ) : null}
          <div className="flex flex-wrap gap-1.5 px-4 pb-3 pt-3">
            <Popover open={picker === "date"} onOpenChange={(o) => setPicker(o ? "date" : null)}>
              <PopoverAnchor asChild>
                <button type="button" className={chip} onClick={() => setPicker("date")} data-touch-target="">
                  <CalendarIcon aria-hidden="true" />
                  {dateLabel}
                </button>
              </PopoverAnchor>
              <PopoverContent align="start" className="content-float w-auto rounded-xl bg-pop p-0 shadow-e3">
                <Calendar
                  mode="single"
                  weekStartsOn={1}
                  selected={draft?.start}
                  onSelect={(d) => {
                    if (!d || !draft) return;
                    const len = draft.end.getTime() - draft.start.getTime();
                    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), draft.start.getHours(), draft.start.getMinutes());
                    base.current = { ...draft, start, end: new Date(start.getTime() + len) };
                    onDraftChange(base.current);
                    setPicker(null);
                  }}
                />
              </PopoverContent>
            </Popover>
            {!allDay ? (
              <Popover open={picker === "time"} onOpenChange={(o) => setPicker(o ? "time" : null)}>
                <PopoverAnchor asChild>
                  <button type="button" className={cn(chip, "tabular-nums")} onClick={() => setPicker("time")} data-touch-target="">
                    <Clock aria-hidden="true" />
                    {timeLabel}
                  </button>
                </PopoverAnchor>
                <PopoverContent align="start" className="content-float w-[200px] rounded-xl bg-pop p-0 shadow-e3">
                  <TimeList
                    value={draft ? draft.start.getHours() * 60 + draft.start.getMinutes() : null}
                    onPick={(m) => {
                      if (!draft) return;
                      const len = draft.end.getTime() - draft.start.getTime();
                      const start = new Date(draft.start.getFullYear(), draft.start.getMonth(), draft.start.getDate(), Math.floor(m / 60), m % 60);
                      base.current = { start, end: new Date(start.getTime() + len) };
                      onDraftChange(base.current);
                      setPicker(null);
                    }}
                  />
                </PopoverContent>
              </Popover>
            ) : null}
            {task ? null : (
              <Popover open={picker === "guests"} onOpenChange={(o) => setPicker(o ? "guests" : null)}>
                <PopoverAnchor asChild>
                  <button type="button" className={chip} onClick={() => setPicker("guests")} data-touch-target="">
                    <UserPlus aria-hidden="true" />
                    {guests.length ? `${guests.slice(0, 2).map((g) => g.name.split(" ")[0]).join(", ")}${guests.length > 2 ? ` +${guests.length - 2}` : ""}` : "Add guests"}
                  </button>
                </PopoverAnchor>
                <PopoverContent align="start" className="content-float w-[280px] rounded-xl bg-pop p-3 shadow-e3">
                  <PeoplePicker value={guests} onChange={setGuests} exclude={namedPeople.flatMap((n) => (n.person ? [n.person.uuid] : []))} placeholder="Add guests by name" />
                </PopoverContent>
              </Popover>
            )}
            <span className={cn(chip, "cursor-default hover:bg-hover hover:text-ink-2")} title="Your OneCamp calendar">
              <IdentityMark hue={OWN_HUE} variant="dot" size={6} className="!size-1.5" />
              Personal
            </span>
            {task ? null : (
              <button
                type="button"
                aria-pressed={isFocus}
                onClick={() => setFocus((f) => !f)}
                data-touch-target=""
                className={cn(chip, isFocus && "focus-hatch text-ink ring-ink-3")}
              >
                <Moon aria-hidden="true" />
                Focus
              </button>
            )}
            {canBlock && draft && !allDay ? (
              task ? (
                // The task, in its project's hue: press it to pick another; the cross makes it an event again.
                <span className={cn(chip, HUE_CLASS[projectHue(task.project_uuid)], "max-w-full gap-0 bg-hue-tint p-0 text-hue-ink ring-transparent hover:bg-hue-tint hover:text-hue-ink")} data-quick-task="">
                  {pickTask(
                    draft.start,
                    <button type="button" aria-label={`Time for ${task.task_name || "a task"}. Change the task`} data-touch-target="" className={cn(chipButton, "h-full min-w-0 gap-1.5 pl-2 pr-1")}>
                      <StatusGlyph status={taskGlyphStatus(task.task_status)} size={12} />
                      <span className="max-w-[12rem] truncate">{task.task_name || "A task"}</span>
                    </button>,
                  )}
                  <button type="button" aria-label="Not for a task" onClick={() => setTask(null)} data-touch-target="" className={cn(chipButton, "h-full px-1 opacity-70 hover:opacity-100")}>
                    <X aria-hidden="true" />
                  </button>
                </span>
              ) : (
                pickTask(
                  draft.start,
                  <button type="button" aria-label="Block time for a task" data-touch-target="" className={chip}>
                    <ListTodo aria-hidden="true" />
                    Time for a task
                  </button>,
                )
              )
            ) : null}
          </div>
          <div className="flex items-center justify-between border-t border-line px-3 py-2.5">
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => {
                const v = values();
                if (v) onMoreOptions(v);
              }}
            >
              More options
            </Button>
            <div className="flex items-center gap-1">
              <Button type="button" variant="ghost" size="icon-xs" aria-label="Discard" onClick={onClose}>
                <X />
              </Button>
              <Button type="submit" size="sm" busy={post.isSubmitting || blocking}>
                Save
                <kbd className="kbd" aria-hidden="true">
                  ⏎
                </kbd>
              </Button>
            </div>
          </div>
        </form>
      </BesideBlockContent>
    </Popover>
  );
}
