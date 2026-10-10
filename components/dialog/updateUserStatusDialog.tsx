"use client"

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {Input} from "@/components/ui/input";
import {useMedia} from "@/context/MediaQueryContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
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
import { fieldLabel, fieldRow } from "@/lib/ui/fieldRow"


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
    return uniqueBy(filteredStatuses, (s) => s).slice(0, 5)
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

  return (
      <>
    <Dialog open={dialogOpenState} onOpenChange={(open) => { if (!open) closeModal() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className='text-start'>Set a status</DialogTitle>
          <DialogDescription className='text-start'>People see it beside your name until it clears.</DialogDescription>
        </DialogHeader>

        <div className='flex flex-col gap-3'>
          <div className='relative'>
            <div className='absolute left-1.5 top-1.5 z-[var(--z-popover)]'>
              <ReactionPicker
                  onReactionSelect={(reaction) => {
                    if (!isStandardReaction(reaction)) return
                    setEmoji(reaction.id)
                  }}
                  showCustomReactions={false}
              >
                <Button aria-label="Choose a status emoji"
                    variant='ghost'
                    size={'icon'}
                >
                  <span className='text-lg'>{selectedEmoji}</span>
                </Button>
              </ReactionPicker>
            </div>
            <Input
                autoFocus={!isMobile}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder='What’s your status?'
                aria-label="Status"
                autoComplete="off"
                className='h-12 rounded-md bg-transparent pl-12 text-base md:text-sm dark:bg-transparent'
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    onSave()
                  }
                }}
            />
          </div>

          {/* A label and its value on one line, as in the task panel. */}
          <div className={fieldRow("center", "")}>
            <span className={fieldLabel} id="status-clears-label">Clear after</span>
            <Select
                onValueChange={(value) => {
                  if (value === 'custom') {
                    setCustomExpirationCalendarDialogOpen(true)
                    return
                  }
                  setExpiresIn(value as StatusTime)
                  setExpiresAt(defaultState.expires_at)
                }}
                value={expiresIn ?? '30m'}
            >
              <SelectTrigger className="h-8 w-full sm:w-56" aria-labelledby="status-clears-label">
                <SelectValue>{expiryWords(expiresIn ?? '30m', expiresAt)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {(['30m', '1h', '4h', 'today', 'this_week', 'custom'] as const).map((code) => (
                    <SelectItem key={code} value={code}>{EXPIRY_WORDS[code]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className='flex flex-col gap-1'>
          <p className={fieldLabel}>Suggestions</p>
          <div className='scrollbar-hide -mx-2 flex max-h-[40vh] flex-col'>
            {suggestedStatuses?.map((preset) => {
              const emojiFound = findEmojiMartEmojiByEmojiID(emojiData.data, preset.status_user_emoji_id)
              return (
                  <button
                      type="button"
                      key={`${preset.status_user_emoji_id}|${preset.status_user_emoji_desc}`}
                      className='flex h-9 items-center gap-2.5 rounded-md px-2 text-left text-sm transition-colors duration-100 hover:bg-highlight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70'
                      onClick={() => {
                        setEmoji(preset.status_user_emoji_id)
                        setMessage(preset.status_user_emoji_desc)
                        setExpiresIn(preset.status_user_emoji_expiry_in ?? defaultState.expiration_setting)
                        setExpiresAt(defaultState.expires_at)
                      }}
                  >
                    <span className='flex h-6 w-6 shrink-0 items-center justify-center font-["emoji"]' aria-hidden="true">
                      {emojiFound?.skins[0].native}
                    </span>
                    <span className='min-w-0 flex-1 truncate'>{preset.status_user_emoji_desc}</span>
                    <span className='shrink-0 text-xs text-muted-foreground'>{expiryWords(preset.status_user_emoji_expiry_in)}</span>
                  </button>
              )
            })}
          </div>
        </div>

        <DialogFooter className="!flex-row items-center gap-2 sm:justify-between">
          {hasStatus ? (
              <Button variant='ghost' onClick={clearStatus}>
                Clear status
              </Button>
          ) : <span />}
          <div className='flex gap-2'>
            <Button variant='outline' onClick={closeModal}>
              Cancel
            </Button>
            <Button onClick={onSave} disabled={!message.trim()}>
              {hasStatus ? 'Save' : 'Set status'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
