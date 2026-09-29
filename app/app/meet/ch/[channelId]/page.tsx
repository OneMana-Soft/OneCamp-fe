"use client";



import {use,  useState} from "react";
import {VideoConference} from "@/components/livekit/VideoConference";
import {useRouter} from "next/navigation";
import {PreJoin} from "@/components/livekit/PreJoin";
import {useFetch, useFetchOnlyOnce} from "@/hooks/useFetch";
import {CallTokenResponseInterface, UserProfileInterface} from "@/types/user";
import {GetEndpointUrl, PostEndpointUrl} from "@/services/endPoints";
import {usePost} from "@/hooks/usePost";
import {ChannelInfoInterfaceResp, GetChannelCallInterface} from "@/types/channel";

export default function Page({ params }: { params: Promise<{ channelId: string, roomId: string}> }) {
  const { channelId } = use(params);

  const router = useRouter();

  const [token, setToken] = useState("");
  const [isPreJoinComplete, setIsPreJoinComplete] = useState(false);

  const post = usePost();

  const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)

    const channelInfo  = useFetch<ChannelInfoInterfaceResp>(`${GetEndpointUrl.ChannelBasicInfo}/${channelId}`)


    const handlePreJoin = async (values: { audioEnabled: boolean; videoEnabled: boolean }) => {
      setIsPreJoinComplete(true);
      // Here we would normally fetch the token with initial state settings if the API supported it,
      // or just join. For now, let's try to fetch token here.

      post.makeRequest<GetChannelCallInterface, CallTokenResponseInterface>({
        payload: {
            channel_uuid: channelId,
            audio_enabled: values.audioEnabled,
            video_enabled: values.videoEnabled,
        },
        apiEndpoint: PostEndpointUrl.CreateChannelVideoCallToken
      }).then((resp)=>{

          if(resp) {
              setToken(resp.token)
          }
      })

  };

    const toggleRecording = (isRecording: boolean) => {

        let postURl = PostEndpointUrl.StartChannelCallRecording

        if(isRecording) {
            postURl = PostEndpointUrl.StopChannelCallRecording
        }

        post.makeRequest<GetChannelCallInterface>({
            payload: {
                channel_uuid: channelId,
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
      return <PreJoin onJoin={handlePreJoin} username={selfProfile.data?.data.user_name || ''} place={channelInfo.data?.channel_info.ch_name ? `#${channelInfo.data.channel_info.ch_name}` : undefined} onCancel={handleDisconnect} />;
  }

  return (
    <VideoConference
      token={token}
      serverUrl={process.env.NEXT_PUBLIC_LIVEKIT_URL || ""} 
      onDisconnect={handleDisconnect}
      toggleRecording={toggleRecording}
      isAdmin={channelInfo.data?.channel_info.ch_is_admin || false}
      place={channelInfo.data?.channel_info.ch_name ? `#${channelInfo.data.channel_info.ch_name}` : undefined}
    />
  );
}
