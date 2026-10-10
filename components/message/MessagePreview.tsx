import { displayNameOf } from "@/lib/personName"
import Link from "next/link";
import {UserProfileDataInterface} from "@/types/user";
import {cn} from "@/lib/utils/helpers/cn";
import { SendHorizontal } from "@/lib/icons";
import MinimalTiptapTextInput from "@/components/textInput/textInput";
import {MessagePreviewAvatar} from "@/components/message/MessagePreviewAvatar";
import {formatTimeForPostOrComment} from "@/lib/utils/date/formatTimeForPostOrComment";
import {PrincipalTag} from "@/components/ui/principalTag";
import {useRelayedAuthor} from "@/hooks/useRelayedAuthor";
import {RelayedAvatar} from "@/components/message/relayedAvatar";
import {getLastMessagePreview} from "@/lib/utils/lastMessagePreview";
import {quoteBarClass} from "@/components/message/quoteBar";
import {app_channel_path} from "@/types/paths";

interface MsgPreviewProps {
    msgText?: string
    msgBy?: UserProfileDataInterface
    msgChannelName?: string
    msgChannelUUID?: string
    msgUUID?: string
    msgCreatedAt?: string
    /**
     * false: a reply's parent, drawn as one line (the caller draws the bar).
     * true: a forwarded message, with where it was posted and a link to it.
     * Left out: the message whole, without the footer (the forward dialog).
     */
    vewFooter?:boolean
}

/**
 * Another message shown inside this one: the one a reply answers, or one that
 * was forwarded.
 *
 * A reply's parent was a second message inside the first: a 36px avatar, the
 * name, the time on a line of its own and up to 192px of the parent's text,
 * about 90px before the reply's own words began. It is a reference now, one
 * line as Discord and Slack draw it: the name and the start of what they said,
 * on a bar in their hue. A click still jumps to the message.
 *
 * A forwarded message keeps its words, under a one-line header (a 24px avatar,
 * the name and the time), on the same hued bar, and says where it was posted.
 * Its "view message" and "view conversation" did nothing when pressed; "View
 * message" opens the post now, and a forwarded direct message says only where
 * it came from, as there is no conversation here to open.
 */
export function MessagePreview (msgInfo : MsgPreviewProps) {
    // A quoted guest or Slack person is named as themselves (see lib/relayedAuthor).
    const relayed = useRelayedAuthor(msgInfo.msgBy, msgInfo.msgText)
    const name = relayed ? relayed.name : (displayNameOf(msgInfo.msgBy) || msgInfo.msgChannelName || "")
    const body = relayed ? relayed.body : msgInfo.msgText

    if (msgInfo.vewFooter === false) {
        return (
            <span data-quote-line="" className="flex min-w-0 items-baseline gap-1.5 py-0.5 text-sm leading-5">
                <span className="shrink-0 font-medium text-foreground">{name}</span>
                <span className="min-w-0 truncate text-muted-foreground">{getLastMessagePreview(body)}</span>
            </span>
        )
    }

    return (
        <div data-forwarded="" className={cn("mt-1 min-w-0 pl-3", quoteBarClass(msgInfo.msgBy))}>
            <div className="flex min-w-0 items-center gap-1.5 text-sm leading-6">
                {relayed ? (
                    <span className="h-6 w-6 shrink-0">
                        <RelayedAvatar name={relayed.name}/>
                    </span>
                ) : (
                    <MessagePreviewAvatar userInfo={msgInfo.msgBy} className="h-6 w-6"/>
                )}
                <span className="truncate font-semibold text-foreground">{name}</span>
                {relayed && <PrincipalTag kind={relayed.kind}/>}
                {msgInfo.msgCreatedAt && (
                    <span className="shrink-0 text-2xs tabular-nums text-muted-foreground">
                        {formatTimeForPostOrComment(msgInfo.msgCreatedAt)}
                    </span>
                )}
            </div>

            <div className='max-h-40 overflow-hidden'>
                <MinimalTiptapTextInput
                    throttleDelay={300}
                    isOutputText={true}
                    className={cn("max-w-full h-auto border-none")}
                    editorContentClassName="overflow-auto "
                    output="html"
                    content={body}
                    placeholder={""}
                    editable={false}
                    ButtonIcon={SendHorizontal}
                    buttonOnclick={() => {
                    }}
                    editorClassName="focus:outline-none "
                />
            </div>

            {msgInfo.vewFooter && (
                <p className='mt-0.5 text-xs text-muted-foreground'>
                    {msgInfo.msgChannelUUID ? (
                        <>
                            Posted in #{msgInfo.msgChannelName}
                            {msgInfo.msgUUID && (
                                <>
                                    {" · "}
                                    <Link
                                        href={`${app_channel_path}/${msgInfo.msgChannelUUID}/${msgInfo.msgUUID}`}
                                        className="rounded-sm font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
                                    >
                                        View message
                                    </Link>
                                </>
                            )}
                        </>
                    ) : (
                        "From a direct message"
                    )}
                </p>
            )}
        </div>
    )
}
