"use client"

import { Button } from "@/components/ui/button";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { PresenceDot } from "@/components/ui/presenceDot";
import { usePauseNotifications } from "@/hooks/usePauseNotifications";
import { lastAnchorRect, SIDEBAR_FOOT } from "@/lib/hub/lastAnchor";
import { springPop } from "@/lib/celebrate";
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
import {useMedia} from "@/context/MediaQueryContext";
import CustomExpirationCalendarDialog from "@/components/dialog/customExpirationCalendarDialog";
import {addHours} from "date-fns";
import {useEmojiMartData} from "@/hooks/reactions/useEmojiMartData";
import {findEmojiMartEmojiByEmojiID} from "@/lib/utils/reaction/findReaction";
import {usePost} from "@/hooks/usePost";
import {clearUserEmojiStatus, updateUserEmojiStatus} from "@/store/slice/userSlice";
import {useDispatch, useSelector} from "react-redux";
import {RootState} from "@/store/store";
import { browserTZ } from "@/lib/utils/timeZone"
import { shortDateTime } from "@/lib/utils/date/shortDate"


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
  const [customExpirationCalendarDialogOpen, setCustomExpirationCalendarDialogOpen] = useState(false)

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
    setExpiresAt(currentStatus.status_user_emoji_expiry_at ? new Date(currentStatus.status_user_emoji_expiry_at) : defaultState.expires_at)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStatus?.status_user_emoji_id, dialogOpenState])

  const hasStatus = Boolean(currentStatus)

  const { isMobile } = useMedia()

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
    setCustomExpirationCalendarDialogOpen(false);
    setOpenState(false)
  }, [setOpenState])

  // Saved at once: the status shows beside the name as the dialog closes, and
  // goes back to what it was if the server refuses it (the request says why).
  function onSave() {
    if (!message.trim()) return
    const previous = currentStatus
    const expiryAt = expiresAt ? Math.floor(expiresAt.getTime() / 1000).toString() : ""
    dispatch(updateUserEmojiStatus({userUUID: selfId, status: {
        status_user_emoji_expiry_in: expiresIn || undefined,
        status_user_emoji_desc: message.trim(),
        status_user_emoji_expiry_at: expiryAt,
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
        <h2 className="sr-only">Set a status</h2>
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
              autoFocus={!isMobile}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="What’s your status?"
              aria-label="Status"
              autoComplete="off"
              className="h-full min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-ink-3 md:text-ui"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  onSave()
                }
              }}
          />
        </div>

        {focusUntil ? (
            <div data-status-automatic="" className="flex h-9 items-center gap-2.5 rounded-md px-2 text-ui">
              <span className="relative size-4 shrink-0"><PresenceDot presence="focus" className="!static !size-2.5 !min-h-2.5 !min-w-2.5 m-[3px]" /></span>
              <span className="min-w-0 flex-1 truncate">In focus until {shortDateTime(focusUntil)}</span>
              <span className="shrink-0 rounded-[5px] bg-sunken px-1.5 text-micro font-medium text-ink-3">Automatic</span>
            </div>
        ) : null}

        <div className="-mx-1 flex max-h-[40vh] flex-col overflow-y-auto" role="group" aria-label="Suggestions">
          {suggestedStatuses?.map((preset) => {
            const emojiFound = findEmojiMartEmojiByEmojiID(emojiData.data, preset.status_user_emoji_id)
            return (
                <button
                    type="button"
                    data-status-suggestion=""
                    key={`${preset.status_user_emoji_id}|${preset.status_user_emoji_desc}`}
                    className="flex h-[34px] items-center gap-2.5 rounded-md px-2 text-left text-ui transition-colors duration-100 hover:bg-hover focus-visible:outline-2 focus-visible:outline-brand max-sm:h-12"
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
          <div role="radiogroup" aria-labelledby="status-clears-label" className="flex flex-wrap gap-1.5">
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
                        if (c.code === 'custom') {
                          setCustomExpirationCalendarDialogOpen(true)
                          return
                        }
                        setExpiresIn(c.code)
                        setExpiresAt(defaultState.expires_at)
                      }}
                      className={cn(
                          // 8px sides: the six fit the 360px popover on one line (hub.md
                          // P3); at 10 "Custom" wrapped to a line of its own.
                          "inline-flex h-[26px] items-center rounded-[13px] px-2 text-meta font-medium transition-colors",
                          on ? "bg-raised text-foreground shadow-sel" : "hub-chip-rest text-ink-2 hover:text-foreground",
                      )}
                  >
                    {c.code === 'custom' && on && expiresAt ? expiryWords('custom', expiresAt) : c.label}
                  </button>
              )
            })}
          </div>
        </div>

        <div className="flex items-center gap-2 pt-1">
          {hasStatus ? (
              <Button variant="ghost" size="sm" onClick={clearStatus}>
                Clear status
              </Button>
          ) : null}
          <Button size="sm" className="ml-auto" onClick={onSave} disabled={!message.trim()}>
            {hasStatus ? 'Save' : 'Set status'}
          </Button>
        </div>
      </div>
  )

  const onOpenChange = (open: boolean) => { if (!open) closeModal() }
  const box = anchor ?? (typeof window !== "undefined" ? new DOMRect(window.innerWidth / 2 - 180, 96, 0, 0) : new DOMRect(0, 0, 0, 0))

  return (
      <>
        {isMobile ? (
            <Drawer open={dialogOpenState} onOpenChange={onOpenChange}>
              <DrawerContent className="px-4 pb-6">
                <DrawerTitle className="py-3 text-heading font-semibold">Set a status</DrawerTitle>
                {contents}
              </DrawerContent>
            </Drawer>
        ) : (
            // A popover, not a modal: setting a status is a two-second job.
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
                {contents}
              </PopoverContent>
            </Popover>
        )}
        <CustomExpirationCalendarDialog
            dialogOpenState={customExpirationCalendarDialogOpen}
            setOpenState={setCustomExpirationCalendarDialogOpen}
            initialDate={expiresAt ?? addHours(new Date(), 1)}
            onChange={(date) => {
              setExpiresIn('custom')
              setExpiresAt(date)
            }}
        />
      </>
  );
};

export default UpdateUserStatusDialog;
