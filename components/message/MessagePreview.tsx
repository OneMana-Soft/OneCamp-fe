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
import { HUE_CLASS } from "@/components/ui/graphics/hues";
import { hueFor } from "@/lib/campHue";
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

    // A forwarded message (design v3 chat, C23): a sunken card with a 2px
    // bar in its author's hue (never the accent), their face and name, where
    // and when it was said, the words clamped to four lines with a fade, and
    // the way back to the original.
    return (
        <div data-forwarded="" className="relative mt-2 min-w-0 max-w-[520px] overflow-hidden rounded-xl bg-sunken py-2.5 pl-4 pr-3">
            <span aria-hidden="true" className={cn("absolute bottom-2 left-1.5 top-2 w-0.5 rounded-full bg-hue", HUE_CLASS[hueFor(name)])} />
            <div className="flex min-w-0 items-center gap-2">
                {relayed ? (
                    <span className="size-5 shrink-0">
                        <RelayedAvatar name={relayed.name}/>
                    </span>
                ) : (
                    <MessagePreviewAvatar userInfo={msgInfo.msgBy} className="size-5 [&_span]:text-3xs"/>
                )}
                <span className="truncate text-ui-sm font-medium text-ink">{name}</span>
                {relayed && <PrincipalTag kind={relayed.kind}/>}
                <span className="min-w-0 shrink truncate text-meta tabular-nums text-ink-3">
                    {[msgInfo.msgChannelName ? `in #${msgInfo.msgChannelName}` : null, msgInfo.msgCreatedAt ? formatTimeForPostOrComment(msgInfo.msgCreatedAt) : null].filter(Boolean).join(" · ")}
                </span>
            </div>

            <div className="chat-body relative mt-1 max-h-[92px] overflow-hidden [mask-image:linear-gradient(to_bottom,#000_70px,transparent)]">
                <MinimalTiptapTextInput
                    throttleDelay={300}
                    isOutputText={true}
                    className={cn("max-w-full h-auto border-none")}
                    editorContentClassName="overflow-hidden"
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
                <p className='mt-1.5 text-meta'>
                    {msgInfo.msgChannelUUID && msgInfo.msgUUID ? (
                        <Link
                            href={`${app_channel_path}/${msgInfo.msgChannelUUID}/${msgInfo.msgUUID}`}
                            className="rounded-sm font-medium text-brand-text underline-offset-[3px] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                        >
                            View original
                        </Link>
                    ) : (
                        <span className="text-ink-3">From a direct message</span>
                    )}
                </p>
            )}
        </div>
    )
}
