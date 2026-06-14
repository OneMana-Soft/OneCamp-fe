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
  UserEmojiStatus, UserEmojiStatusResp, UserProfileInterface,
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
import {getTimeRemaining} from "@/lib/utils/status/memberStatus";
import {Separator} from "@/components/ui/separator";
import CustomExpirationCalendarDialog from "@/components/dialog/customExpirationCalendarDialog";
import {addHours} from "date-fns";
import { X } from "@/lib/icons";
import {useEmojiMartData} from "@/hooks/reactions/useEmojiMartData";
import {findEmojiMartEmojiByEmojiID} from "@/lib/utils/reaction/findReaction";
import {usePost} from "@/hooks/usePost";
import {clearUserEmojiStatus, updateUserEmojiStatus} from "@/store/slice/userSlice";
import {useDispatch, useSelector} from "react-redux";
import {RootState} from "@/store/store";


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
    pause_notifications: false
  }

  const post = usePost()
  const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)

  const dispatch = useDispatch()
  const userStatusState = useSelector((state: RootState) => state.users.usersStatus[selfProfile.data?.data.user_uuid||''] || {} as UserEmojiStatus);
  const memberStatus = userStatusState.emojiStatus?.status_user_emoji_id ? userStatusState.emojiStatus : null;

  const memberStatusIsExpired = useStatusIsExpired(memberStatus)
  const recentStatusesResp = useFetch<UserStatusRespInterface>(GetEndpointUrl.GetUserStatuses)
  const currentStatus = memberStatusIsExpired ? undefined : memberStatus

  const [emoji, setEmoji] = useState( defaultState.emoji)
  const [message, setMessage] = useState(defaultState.message)
  const [expiresIn, setExpiresIn] = useState<StatusTime | null>(defaultState.expiration_setting)
  const [expiresAt, setExpiresAt] = useState<Date | undefined>(defaultState.expires_at)
  const [customExpirationCalendarDialogOpen, setCustomExpirationCalendarDialogOpen] = useState(false)

  const emojiData = useEmojiMartData()




  useEffect(()=>{

    if(memberStatus) {
      findEmojiMartEmojiByEmojiID(emojiData.data, currentStatus?.status_user_emoji_id ?? defaultState.emoji)
      setEmoji(currentStatus?.status_user_emoji_id ??defaultState.emoji)
      setMessage(currentStatus?.status_user_emoji_desc ?? defaultState.message)
      setExpiresIn(currentStatus?.status_user_emoji_expiry_in ?? defaultState.expiration_setting)
      setExpiresAt(currentStatus?.status_user_emoji_expiry_at ? new Date(currentStatus.status_user_emoji_expiry_at) : defaultState.expires_at)
    }


  },[memberStatus?.status_user_emoji_id])

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

    return uniqueBy(filteredStatuses, (filteredStatuses) => filteredStatuses)
        .slice(0, 5)
        .reverse()
  }, [recentStatusesResp.data])

  function onSave() {

      post.makeRequest<UpdateUserEmojiStatusReq>({apiEndpoint: PostEndpointUrl.UpdateUserEmojiStatus, showToast:true, payload:{
          emoji_expiry_time_at: (expiresAt ? Math.floor(expiresAt.getTime() / 1000).toString() : ""),
          emoji_expiry_time_in: expiresIn || '',
          emoji_id: emoji,
          emoji_status_desc: message,
          emoji_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
        }})
          .then(()=>{
            dispatch(updateUserEmojiStatus({userUUID: selfProfile.data?.data.user_uuid || '', status: {
                status_user_emoji_expiry_in: expiresIn || undefined,
                status_user_emoji_desc: message,
                status_user_emoji_expiry_at: (expiresAt ? Math.floor(expiresAt.getTime() / 1000).toString() : ""),
                status_user_emoji_id: emoji

              }}));
            closeModal()
          })
  }


  function resetStateToDefaults() {

    post.makeRequest<UpdateUserEmojiStatusReq>({apiEndpoint: PostEndpointUrl.ClearEmojiStatus})
        .then(()=>{
          setEmoji(defaultState.emoji)
          setMessage(defaultState.message)
          setExpiresIn(defaultState.expiration_setting)
          setExpiresAt(defaultState.expires_at)
          // Explicit clear-intent: route through the dedicated reducer
          // so the empty payload actually wipes Redux state. The
          // generic updateUserEmojiStatus reducer ignores empty
          // payloads to defend against profile-fetch clobbers.
          dispatch(clearUserEmojiStatus({userUUID: selfProfile.data?.data.user_uuid || ''}));
        })
  }

  const timeRemaining = getTimeRemaining(currentStatus?.status_user_emoji_expiry_at)

  const closeModal = useCallback(() => {
    setCustomExpirationCalendarDialogOpen(false);
    setOpenState(false)
  }, [setOpenState])

  const selectedEmoji = findEmojiMartEmojiByEmojiID(emojiData.data, emoji)?.skins[0].native


  return (
      <>
    <Dialog  open={dialogOpenState} >
      {/*<DialogTrigger asChild>*/}
      {/*    <Button variant="secondary">Save</Button>*/}
      {/*</DialogTrigger>*/}
      <DialogContent className="max-w-[95vw] md:max-w-[30vw] [&>button]:hidden">
        <button
            onClick={closeModal}
            className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground !block"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </button>
        <DialogHeader>
          <DialogTitle className='text-start'>Status</DialogTitle>
          <DialogDescription>
          </DialogDescription>
        </DialogHeader>
        <div className='scrollbar-hide flex max-h-[40vh] flex-1 flex-col  px-2 py-3'>
          {suggestedStatuses?.map((preset, i) => {
            const emojiFound = findEmojiMartEmojiByEmojiID(emojiData.data, preset.status_user_emoji_id)

            return (
                <Button
                    variant='ghost'
                    key={i}
                    className=' flex h-10 cursor-pointer justify-start gap-1.5 rounded-lg px-2 py-3 text-sm'
                    onClick={() => {


                      setEmoji(preset.status_user_emoji_id)
                      setMessage(preset.status_user_emoji_desc)
                      setExpiresIn(preset.status_user_emoji_expiry_in ?? defaultState.expiration_setting)

                      // closeModal()
                    }}
                >
                <span className='flex h-6 w-6 items-center justify-center text-center font-["emoji"]'>
                  {emojiFound?.skins[0].native}
                </span>
                  <span className='line-clamp-1'>{preset.status_user_emoji_desc}</span>
                  <span className='text-muted-foreground text-sm'>{preset.status_user_emoji_expiry_in?.replace('_', ' ')}</span>
                </Button>
            )
          })}
        </div>
        <Separator
            orientation="horizontal"
            className=""
        />
        <div className='flex flex-col gap-3  '>
          <div className='relative'>
            <div className='absolute left-1.5 top-1.5 z-[var(--z-popover)]'>
              <ReactionPicker
                  onReactionSelect={(reaction) => {
                    if (!isStandardReaction(reaction)) return
                    setEmoji(reaction.id)
                  }}
                  showCustomReactions={false}
              >
                <Button
                    variant='ghost'
                    // accessibilityLabel='Update status emoji'
                    className='group/emoji'
                    size={'icon'}
                >
                  <span className='text-lg'>{selectedEmoji}</span>
                </Button>
              </ReactionPicker>
            </div>
            <Input
                autoFocus={!isMobile}
                value={message}
                onChange={(e) => {
                  setMessage(e.target.value)
                }}
                placeholder='What’s your status?'
                className='bg-transparent rounded-md text-[15px] h-12 dark:bg-transparent pl-12 pr-24'
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    onSave()
                  }
                }}
            />
            {message && (
                <div className='absolute right-1.5 top-1.5 '>


                  <Select onValueChange={(value) => {

                    if (value === 'custom') {
                      setCustomExpirationCalendarDialogOpen(true)
                      return
                    }
                    setExpiresIn(value as StatusTime)
                    setExpiresAt(defaultState.expires_at)
                  }}
                          defaultValue={'30m'}
                          value={expiresIn ?? '30m'}
                  >
                    <SelectTrigger className="mr-2 decoration-0 border-0" aria-hidden={false}>
                      <SelectValue aria-hidden={false}>
                        {expiresIn && expiresIn === 'custom'
                            ? getTimeRemaining(expiresAt?.toISOString())
                            : (expiresIn?.replace('_', ' ') ?? timeRemaining)}</SelectValue>
                    </SelectTrigger>
                    <SelectContent aria-hidden={false}>
                      <SelectItem value="30m">30m</SelectItem>
                      <SelectItem value="1h">1h</SelectItem>
                      <SelectItem value="4h">4h</SelectItem>
                      <SelectItem value="today">Today</SelectItem>
                      <SelectItem value="this_week">This Week</SelectItem>
                      <SelectItem value="custom" aria-hidden={false}>Custom</SelectItem>
                    </SelectContent>
                  </Select>

                </div>
            )}
          </div>


        </div>

        <DialogFooter className="!flex-row">
          <div className='flex-1'>
            <Button variant='secondary' onClick={closeModal}>
              Cancel
            </Button>
          </div>
          <div>
            {hasStatus &&  (
                <Button
                    onClick={() => {
                      // deleteStatus.mutate({ org: `${scope}` })
                      resetStateToDefaults()
                    }}
                >
                  Clear current status
                </Button>
            )}

            {( !hasStatus) && (
                <Button
                    onClick={onSave}
                    // disabled={updateStatus.isPending || !isDirty || !message}
                    disabled={!message}
                >
                  Update status
                </Button>
            )}

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
