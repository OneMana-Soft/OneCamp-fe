"use client";


import type { RawUserDMInterface } from "@/types/user";
import {use,  useState} from "react";
import {VideoConference} from "@/components/livekit/VideoConference";
import {useRouter} from "next/navigation";
import {PreJoin} from "@/components/livekit/PreJoin";
import {useFetchOnlyOnce} from "@/hooks/useFetch";
import {CallTokenResponseInterface, UserProfileInterface} from "@/types/user";
import {GetEndpointUrl, PostEndpointUrl} from "@/services/endPoints";
import {usePost} from "@/hooks/usePost";
import {GetChatCallInterface} from "@/types/chat";

export default function Page({ params }: { params: Promise<{ grpId: string, roomId: string}> }) {
  const { roomId, grpId } = use(params);

  const router = useRouter();

  const [token, setToken] = useState("");
  const [isPreJoinComplete, setIsPreJoinComplete] = useState(false);

  const post = usePost();

  const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)
  // The same request the group's header makes, so this is usually already cached.
  const participants = useFetchOnlyOnce<RawUserDMInterface>(`${GetEndpointUrl.GetDmGroupParticipants}/${grpId}`)
  const others = (participants.data?.data?.dm_participants || []).filter((u) => u.user_uuid !== selfProfile.data?.data.user_uuid).map((u) => u.user_name)
  const groupPlace = others.length ? others.slice(0, 3).join(", ") + (others.length > 3 ? ` and ${others.length - 3} more` : "") : undefined


  const handlePreJoin = async (values: { audioEnabled: boolean; videoEnabled: boolean }) => {
      setIsPreJoinComplete(true);
      // Here we would normally fetch the token with initial state settings if the API supported it,
      // or just join. For now, let's try to fetch token here.

      post.makeRequest<GetChatCallInterface, CallTokenResponseInterface>({
        payload: {
            grp_id: grpId,
            audio_enabled: values.audioEnabled,
            video_enabled: values.videoEnabled,
        },
        apiEndpoint: PostEndpointUrl.CreateGroupChatVideoCallToken
      }).then((resp)=>{

          if(resp) {
              setToken(resp.token)
          }
      })

  };

    const toggleRecording = (isRecording: boolean) => {

        let postURl = PostEndpointUrl.StartGrpCallRecording

        if(isRecording) {
            postURl = PostEndpointUrl.StopGrpCallRecording
        }

        post.makeRequest<GetChatCallInterface>({
            payload: {
                grp_id: grpId,
            },
            apiEndpoint: postURl
        })

    }

  const handleDisconnect = () => {
      // close window if opened in new tab
      if (window.history.length > 1) {
          router.back();
      } else {
          window.close();
      }
  };

  if (!isPreJoinComplete) {
      return <PreJoin onJoin={handlePreJoin} username={selfProfile.data?.data.user_name || ''} place={groupPlace} onCancel={handleDisconnect} />;
  }

  return (
    <VideoConference
      token={token}
      serverUrl={process.env.NEXT_PUBLIC_LIVEKIT_URL || ""} 
      onDisconnect={handleDisconnect}
      toggleRecording={toggleRecording}
      isAdmin={true}
      place={groupPlace}
    />
  );
}
