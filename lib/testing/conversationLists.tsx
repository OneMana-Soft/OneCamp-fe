import { channelList } from "@/components/conversation/ChannelRows"
import { ConversationMessages } from "@/components/conversation/ConversationMessages"
import { dmList } from "@/components/conversation/DmRows"
import { groupList } from "@/components/conversation/GroupRows"
import { getGroupingId } from "@/lib/utils/getGroupingId"

// Each kind's list as its pages draw it (chat A1 step 2b), for tests: opened
// at a message when given a link.

/** Who reads the DMs drawn here. */
export const READER = "u-reader"

export const ChannelList = ({ channelId, link }: { channelId: string; link?: string }) => <ConversationMessages list={channelList(channelId)} link={link} />

export const DmList = ({ other, link }: { other: string; link?: string }) => (
  <ConversationMessages list={dmList({ kind: "dm", id: getGroupingId(READER, other), other })} link={link} />
)

export const GroupList = ({ grpId, link }: { grpId: string; link?: string }) => <ConversationMessages list={groupList(grpId)} link={link} />
