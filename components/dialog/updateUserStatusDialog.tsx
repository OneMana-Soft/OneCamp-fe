"use client"

import { Button } from "@/components/ui/button";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { OverlayBody, OverlayFooter, useSheetMode } from "@/components/ui/overlay";
import { PresenceDot } from "@/components/ui/presenceDot";
import { usePauseNotifications } from "@/hooks/usePauseNotifications";
import { lastAnchorRect, SIDEBAR_FOOT } from "@/lib/hub/lastAnchor";
import { springPop } from "@/lib/spring";
import { cn } from "@/lib/utils/helpers/cn";
import * as React from "react";
import {ReactionPicker} from "@/components/reactionPicker/reactionPicker";
import {useCallback, useEffect, useMemo, useState} from "react";
import {useFetch, useFetchOnlyOnce} from "@/hooks/useFetch";
import {
  StatusTime,
  UpdateUserEmojiStatusReq,
  UserEmojiStatus, UserProfileInterface,
  UserStatusRespInterface
} from "@/types/user";
import { uniqueBy } from 'remeda'
import {useStatusIsExpired} from "@/hooks/useStatusIsExpired";
import {GetEndpointUrl, PostEndpointUrl} from "@/services/endPoints";
import {isStandardReaction} from "@/lib/utils/reaction/checker";
import {DateField, TimeField, timeValueOf} from "@/components/ui/date-field";
import {format} from "date-fns";
import {useEmojiMartData} from "@/hooks/reactions/useEmojiMartData";
import {findEmojiMartEmojiByEmojiID} from "@/lib/utils/reaction/findReaction";
import {usePost} from "@/hooks/usePost";
import {clearUserEmojiStatus, updateUserEmojiStatus} from "@/store/slice/userSlice";
import {useDispatch, useSelector} from "react-redux";
import {RootState} from "@/store/store";
import { browserTZ } from "@/lib/utils/timeZone"
import { shortDateTime } from "@/lib/utils/date/shortDate"
import { statusEndOf, statusTextLength, statusTextProblem, STATUS_TEXT_MAX } from "@/lib/status/statusRule"
import { isComposingKey } from "@/lib/keys/ime"


const DEFAULT_STATUSES: UserEmojiStatus[] = [
  {
    status_user_emoji_id: 'sandwich',
    status_user_emoji_desc: 'Lunch',
    status_user_emoji_expiry_in: '30m'
  },
  {
    status_user_emoji_id: 'spiral_calendar_pad',
    status_user_emoji_desc: 'In a meeting',
    status_user_emoji_expiry_in: '1h'
  },
  {
    status_user_emoji_id: 'brain',
    status_user_emoji_desc: 'Deep work',
    status_user_emoji_expiry_in: '4h'
  },
  {
    status_user_emoji_id: 'telephone_receiver',
    status_user_emoji_desc: 'In a call',
    status_user_emoji_expiry_in: '1h'
  },
  {
    status_user_emoji_id: 'headphones',
    status_user_emoji_desc: 'Focus time',
    status_user_emoji_expiry_in: '1h'
  },
  {
    status_user_emoji_id: 'mask',
    status_user_emoji_desc: 'Sick',
    status_user_emoji_expiry_in: 'today'
  },
  {
    status_user_emoji_id: 'palm_tree',
    status_user_emoji_desc: 'Vacationing',
    status_user_emoji_expiry_in: 'this_week'
  }
]

// When a status clears, in words. The menu said "30m", "this week" and "This
// Week" for the same choices in two places.
const EXPIRY_WORDS: Record<string, string> = {
  '30m': '30 minutes',
  '1h': '1 hour',
  '4h': '4 hours',
  today: 'Today',
  this_week: 'This week',
  custom: 'Pick a time…',
}

// The "Clear after" chips (hub.md P3), shorter than the words above.
const CLEAR_CHIPS: { code: StatusTime | 'custom'; label: string }[] = [
  { code: '30m', label: '30 min' },
  { code: '1h', label: '1 h' },
  { code: '4h', label: '4 h' },
  { code: 'today', label: 'Today' },
  { code: 'this_week', label: 'This week' },
  { code: 'custom', label: 'Custom' },
]

/** A custom end's first offer: an hour from now, on the next quarter hour (the time list's steps). */
function anHourOn(now = new Date()): Date {
  const at = new Date(now.getTime() + 3_600_000)
  at.setHours(0, Math.ceil((at.getHours() * 60 + at.getMinutes()) / 15) * 15, 0, 0)
  return at
}

/** When a status clears, as a person says it: "30 minutes", "This week", "Until 12 Oct, 5:00 PM". Pure. */
export function expiryWords(code: string | null | undefined, at?: Date): string {
  if (code === 'custom' && at && !Number.isNaN(at.getTime())) return `Until ${shortDateTime(at)}`
  return EXPIRY_WORDS[code ?? ''] ?? ''
}

interface updateUserStatusDialogProps {
  dialogOpenState: boolean;
  setOpenState: (state: boolean) => void;
  userUUID: string;
}

const UpdateUserStatusDialog: React.FC<updateUserStatusDialogProps> = ({
  dialogOpenState,
  setOpenState,
}) => {

  const defaultState = {
    emoji: 'speech_balloon',
    message: '',
    expiration_setting: '30m' as StatusTime,
    expires_at: undefined,
  }

  const post = usePost()
  const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)
  const selfId = selfProfile.data?.data.user_uuid || ''

  const dispatch = useDispatch()
  const userStatusState = useSelector((state: RootState) => state.users.usersStatus[selfId] || {} as UserEmojiStatus);
  const memberStatus = userStatusState.emojiStatus?.status_user_emoji_id ? userStatusState.emojiStatus : null;

  const memberStatusIsExpired = useStatusIsExpired(memberStatus)
  const recentStatusesResp = useFetch<UserStatusRespInterface>(GetEndpointUrl.GetUserStatuses)
  const currentStatus = memberStatusIsExpired ? undefined : memberStatus

  const [emoji, setEmoji] = useState(defaultState.emoji)
  const [message, setMessage] = useState(defaultState.message)
  const [expiresIn, setExpiresIn] = useState<StatusTime | null>(defaultState.expiration_setting)
  const [expiresAt, setExpiresAt] = useState<Date | undefined>(defaultState.expires_at)

  const emojiData = useEmojiMartData()
  // Focus time from the calendar is the one automatic status the app knows.
  const { focusUntil } = usePauseNotifications()
  const emojiRef = React.useRef<HTMLSpanElement>(null)
  // Where it opens: beside what was pressed, fixed while open. The account
  // menu's row closes with its menu, so then beside the sidebar foot it rose from.
  const [anchor] = useState(() => lastAnchorRect(SIDEBAR_FOOT))

  // The status the person has now, in the fields, so it can be changed.
  useEffect(() => {
    if (!currentStatus) return
    setEmoji(currentStatus.status_user_emoji_id ?? defaultState.emoji)
    setMessage(currentStatus.status_user_emoji_desc ?? defaultState.message)
    setExpiresIn(currentStatus.status_user_emoji_expiry_in ?? defaultState.expiration_setting)
    const ends = currentStatus.status_user_emoji_expiry_at ? new Date(currentStatus.status_user_emoji_expiry_at) : undefined
    setExpiresAt(ends && !Number.isNaN(ends.getTime()) ? ends : defaultState.expires_at)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStatus?.status_user_emoji_id, dialogOpenState])

  const hasStatus = Boolean(currentStatus)
  // The server's rule for the words (lib/status/statusRule): Save waits for
  // words, and says when they are past the limit.
  const textProblem = statusTextProblem(message)
  const tooLong = statusTextLength(message) > STATUS_TEXT_MAX
  // A custom end is a day and a time in the status itself, the shared date
  // and time fields (D14); one that has passed can't be saved.
  const custom = expiresIn === 'custom'
  // Picked, the day and time come into view: in a short sheet (a phone in
  // landscape) they appeared under the footer's fade.
  const customRow = React.useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (custom) customRow.current?.scrollIntoView?.({ block: "nearest" })
  }, [custom])
  const customPassed = custom && (!expiresAt || expiresAt.getTime() <= Date.now())
  const setCustomPart = (part: 'day' | 'time', value: string) => {
    const [a, b, c] = value.split(/[-:]/).map(Number)
    if (Number.isNaN(a) || Number.isNaN(b)) return
    const next = new Date(expiresAt ?? anHourOn())
    if (part === 'day') next.setFullYear(a, b - 1, c)
    else next.setHours(a, b, 0, 0)
    setExpiresAt(next)
  }

  // A sheet where overlays are sheets (components/ui/overlay: a phone, in
  // portrait or landscape), a popover elsewhere. Width alone gave a phone in
  // landscape the popover, 166px tall with the keyboard up and Set status
  // 324px down its scroll (design/drawers-v3/ANALYSIS.md §1.2).
  const sheet = useSheetMode()
  // The field takes focus as the menu opens under a mouse only: on a touch
  // screen it would raise the keyboard over the menu before it was read.
  const [finePointer] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.("(pointer: fine)").matches)

  const suggestedStatuses = useMemo(() => {
    const presets = [
      ...(recentStatusesResp.data?.data?.filter((status) => status.status_user_emoji_expiry_in !== 'custom') ?? []),
      ...DEFAULT_STATUSES
    ]
    const filteredStatuses = Array.from(
        new Map(
            presets.map((status: UserEmojiStatus) => [
              `${status.status_user_emoji_id}|${status.status_user_emoji_desc}`,
              status,
            ])
        ).values());
    return uniqueBy(filteredStatuses, (s) => s).slice(0, 7)
  }, [recentStatusesResp.data])

  const closeModal = useCallback(() => {
    setOpenState(false)
  }, [setOpenState])

  // Saved at once: the status shows beside the name as the dialog closes, and
  // goes back to what it was if the server refuses it (the request says why).
  function onSave() {
    if (statusTextProblem(message) || customPassed) return
    const previous = currentStatus
    // The store keeps the end as the server sends it (ISO), and the request
    // carries it in epoch seconds: the store once kept the seconds, which no
    // reader could parse, and editing that status sent "NaN".
    const ends = statusEndOf(expiresAt)
    const expiryAt = ends ? Math.floor(new Date(ends).getTime() / 1000).toString() : ""
    dispatch(updateUserEmojiStatus({userUUID: selfId, status: {
        status_user_emoji_expiry_in: expiresIn || undefined,
        status_user_emoji_desc: message.trim(),
        status_user_emoji_expiry_at: ends,
        status_user_emoji_id: emoji,
      }}));
    closeModal()
    post.makeRequest<UpdateUserEmojiStatusReq>({apiEndpoint: PostEndpointUrl.UpdateUserEmojiStatus, showErrorToast: true, payload: {
        emoji_expiry_time_at: expiryAt,
        emoji_expiry_time_in: expiresIn || '',
        emoji_id: emoji,
        emoji_status_desc: message.trim(),
        emoji_timezone: browserTZ()
      }})
        .catch(() => {
          if (previous) dispatch(updateUserEmojiStatus({userUUID: selfId, status: previous}))
          else dispatch(clearUserEmojiStatus({userUUID: selfId}))
        })
  }

  function clearStatus() {
    const previous = currentStatus
    // Explicit clear-intent: the dedicated reducer, so the empty payload
    // actually wipes the status (the generic one ignores empty payloads).
    dispatch(clearUserEmojiStatus({userUUID: selfId}));
    setEmoji(defaultState.emoji)
    setMessage(defaultState.message)
    setExpiresIn(defaultState.expiration_setting)
    setExpiresAt(defaultState.expires_at)
    closeModal()
    post.makeRequest<UpdateUserEmojiStatusReq>({apiEndpoint: PostEndpointUrl.ClearEmojiStatus, showErrorToast: true})
        .catch(() => {
          if (previous) dispatch(updateUserEmojiStatus({userUUID: selfId, status: previous}))
        })
  }

  const selectedEmoji = findEmojiMartEmojiByEmojiID(emojiData.data, emoji)?.skins[0].native

  const contents = (
      <div data-status-menu="" className="flex flex-col gap-3">
        <div className="hub-field flex h-10 items-center gap-1 rounded-[10px] pl-1.5 pr-3">
          <ReactionPicker
              onReactionSelect={(reaction) => {
                if (!isStandardReaction(reaction)) return
                setEmoji(reaction.id)
              }}
              showCustomReactions={false}
          >
            <Button aria-label="Choose a status emoji" variant="ghost" size="icon-sm" className="shrink-0">
              <span ref={emojiRef} className="inline-block text-ui">{selectedEmoji}</span>
            </Button>
          </ReactionPicker>
          <input
              autoFocus={!sheet && finePointer}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="What’s your status?"
              aria-label="Status"
              aria-invalid={tooLong || undefined}
              aria-describedby={tooLong ? "status-too-long" : undefined}
              autoComplete="off"
              className="h-full min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-ink-3 md:text-ui"
              onKeyDown={(e) => {
                // An input method's Enter picks its word (lib/keys/ime).
                if (e.key === 'Enter' && !isComposingKey(e.nativeEvent)) {
                  e.preventDefault()
                  onSave()
                }
              }}
          />
        </div>
        {tooLong ? (
            <p id="status-too-long" className="-mt-1.5 px-1 text-meta text-danger-ink">{textProblem}</p>
        ) : null}

        {focusUntil ? (
            <div data-status-automatic="" className="flex h-9 items-center gap-2.5 rounded-md px-2 text-ui">
              <span className="relative size-4 shrink-0"><PresenceDot presence="focus" className="!static !size-2.5 !min-h-2.5 !min-w-2.5 m-[3px]" /></span>
              <span className="min-w-0 flex-1 truncate">In focus until {shortDateTime(focusUntil)}</span>
              <span className="shrink-0 rounded-[5px] bg-sunken px-1.5 text-micro font-medium text-ink-3">Automatic</span>
            </div>
        ) : null}

        {/* The suggestions flow in the menu, and in the sheet's one scroller on
            a phone: a list of its own with a height cap (40vh) was a second
            scroller there, squeezed its rows under 44px on a short phone, and
            its -4px sides ran past the sheet, which then scrolled sideways
            ("both scroll bars"). */}
        <div className="flex flex-col" role="group" aria-label="Suggestions">
          {suggestedStatuses?.map((preset) => {
            const emojiFound = findEmojiMartEmojiByEmojiID(emojiData.data, preset.status_user_emoji_id)
            return (
                <button
                    type="button"
                    data-status-suggestion=""
                    key={`${preset.status_user_emoji_id}|${preset.status_user_emoji_desc}`}
                    className="flex h-[34px] items-center gap-2.5 rounded-md px-2 text-left text-ui transition-colors duration-100 hover:bg-hover focus-visible:outline-2 focus-visible:outline-brand pointer-coarse:h-12"
                    onClick={() => {
                      setEmoji(preset.status_user_emoji_id)
                      setMessage(preset.status_user_emoji_desc)
                      setExpiresIn(preset.status_user_emoji_expiry_in ?? defaultState.expiration_setting)
                      setExpiresAt(defaultState.expires_at)
                      springPop(emojiRef.current)
                    }}
                >
                  <span className='flex size-5 shrink-0 items-center justify-center font-["emoji"]' aria-hidden="true">
                    {emojiFound?.skins[0].native}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{preset.status_user_emoji_desc}</span>
                  <span className="shrink-0 text-meta text-ink-3">{expiryWords(preset.status_user_emoji_expiry_in)}</span>
                </button>
            )
          })}
        </div>

        <div>
          <p id="status-clears-label" className="mb-1.5 text-meta font-medium text-ink-3">Clear after</p>
          {/* One row in the 360px popover; three by two in a sheet, a finger's
              44px each, where one row can't fit and "Custom" wrapped onto a
              line of its own (and did in the popover too, by 7px). */}
          <div role="radiogroup" aria-labelledby="status-clears-label" className={sheet ? "grid grid-cols-3 gap-2" : "flex flex-nowrap gap-1"}>
            {CLEAR_CHIPS.map((c) => {
              const on = (expiresIn ?? '30m') === c.code
              return (
                  <button
                      key={c.code}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      data-clear-after={c.code}
                      onClick={() => {
                        setExpiresIn(c.code)
                        // Custom keeps a day and time still to come, or offers an hour on.
                        setExpiresAt(c.code === 'custom' ? (at) => (at && at.getTime() > Date.now() ? at : anHourOn()) : defaultState.expires_at)
                      }}
                      className={cn(
                          // 7px sides and 4px apart: the six fit the 360px popover on
                          // one line (hub.md P3). In a sheet, a finger's 44px.
                          "inline-flex items-center justify-center whitespace-nowrap text-meta font-medium transition-colors",
                          sheet ? "h-11 rounded-[22px] px-3" : "h-[26px] rounded-[13px] px-[7px] pointer-coarse:h-9 pointer-coarse:rounded-[18px]",
                          on ? "bg-raised text-foreground shadow-sel" : "hub-chip-rest text-ink-2 hover:text-foreground",
                      )}
                  >
                    {c.label}
                  </button>
              )
            })}
          </div>
          {/* Custom: the day and the time, in the status itself. Each field
              opens the shared picker, a popover by it on a computer and a
              sheet of its own over this one on a phone, never a dialog laid
              over the menu (it took the focus from the popover and closed it,
              and on a phone it sat over the sheet with no name). */}
          {custom ? (
              <div ref={customRow} data-status-custom="" className="mt-2 grid grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] gap-2">
                <DateField
                    aria-label="Clears on"
                    value={expiresAt ? format(expiresAt, 'yyyy-MM-dd') : ''}
                    min={format(new Date(), 'yyyy-MM-dd')}
                    required
                    aria-invalid={customPassed || undefined}
                    aria-describedby={customPassed ? 'status-custom-passed' : undefined}
                    onChange={(v) => setCustomPart('day', v)}
                />
                <TimeField
                    aria-label="Clears at"
                    value={expiresAt ? timeValueOf(expiresAt) : ''}
                    after={expiresAt && expiresAt.toDateString() === new Date().toDateString() ? timeValueOf(new Date()) : undefined}
                    aria-invalid={customPassed || undefined}
                    aria-describedby={customPassed ? 'status-custom-passed' : undefined}
                    onChange={(v) => setCustomPart('time', v)}
                />
              </div>
          ) : null}
          {customPassed ? (
              <p id="status-custom-passed" className="mt-1.5 px-1 text-meta text-danger-ink">That time has passed. Pick a later one.</p>
          ) : null}
        </div>

      </div>
  )

  // The actions, in the footer slot of either form, never in the scroller:
  // pinned under the list, in view whatever the window's height and on the
  // keyboard while the field has it. In a sheet a thumb's 44px across its
  // width; in the menu a small pair at its foot. At the end of the list Set
  // status sat under the screen's edge on an iPhone, and 34px under the fold
  // of a 480px window (design/drawers-v3/ANALYSIS.md §1.2).
  const actions = (
      <div data-status-actions="" className="flex w-full items-center gap-2">
        {hasStatus ? (
            <Button variant={sheet ? "secondary" : "ghost"} size={sheet ? "lg" : "sm"} className={sheet ? "h-11 flex-1" : undefined} onClick={clearStatus}>
              Clear status
            </Button>
        ) : null}
        <Button size={sheet ? "lg" : "sm"} className={sheet ? "h-11 flex-1" : "ml-auto"} onClick={onSave} disabled={!!textProblem || customPassed}>
          {hasStatus ? 'Save' : 'Set status'}
        </Button>
      </div>
  )

  const onOpenChange = (open: boolean) => { if (!open) closeModal() }
  const box = anchor ?? (typeof window !== "undefined" ? new DOMRect(window.innerWidth / 2 - 180, 96, 0, 0) : new DOMRect(0, 0, 0, 0))

  return (
      <>
        {sheet ? (
            // The title is the sheet's pinned header and the actions its pinned
            // footer; between them the body is the one thing that scrolls. Its
            // space is the content's, inside the body: on the sheet itself
            // (pb-6) it took the home-indicator strip's place, and at the
            // body's very sides the field's halo was cut off. A custom end's
            // day and time open as panels of this sheet (components/ui/drawer).
            <Drawer open={dialogOpenState} onOpenChange={onOpenChange}>
              <DrawerContent header={<DrawerTitle className="text-title-3 text-ink">Set a status</DrawerTitle>} footer={actions}>
                <div className="px-4 pb-2">{contents}</div>
              </DrawerContent>
            </Drawer>
        ) : (
            // A popover, not a modal: setting a status is a two-second job. Its
            // body scrolls on a window too short for it, at most the room the
            // window leaves, and the actions stay at its foot
            // (components/ui/overlay).
            <Popover open={dialogOpenState} onOpenChange={onOpenChange} modal={false}>
              <PopoverAnchor asChild>
                <span aria-hidden data-status-anchor="" style={{ position: "fixed", left: box.left, top: box.top, width: box.width, height: box.height, pointerEvents: "none" }} />
              </PopoverAnchor>
              <PopoverContent
                  data-status-popover=""
                  side={anchor ? "right" : "bottom"}
                  align="start"
                  sideOffset={8}
                  collisionPadding={12}
                  aria-label="Set a status"
                  className="hub-pop w-[360px] rounded-2xl bg-pop p-3 shadow-e3"
              >
                <h2 className="sr-only">Set a status</h2>
                <OverlayBody>{contents}</OverlayBody>
                <OverlayFooter className="pt-3">{actions}</OverlayFooter>
              </PopoverContent>
            </Popover>
        )}
      </>
  );
};

export default UpdateUserStatusDialog;
