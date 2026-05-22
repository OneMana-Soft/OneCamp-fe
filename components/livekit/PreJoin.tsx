
"use client";

import { useEffect, useState, useRef } from "react";
import { createLocalVideoTrack, LocalTrack } from "livekit-client";
import { Mic, MicOff, Video, VideoOff, Settings } from "@/lib/icons";
import { Button } from "@/components/ui/button";

interface PreJoinProps {
  onJoin: (values: { audioEnabled: boolean; videoEnabled: boolean }) => void;
  username: string;
}

export function PreJoin({ onJoin, username }: PreJoinProps) {
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoTrack, setVideoTrack] = useState<LocalTrack | undefined>(undefined);
  
  const trackRef = useRef<LocalTrack | undefined>(undefined);

  useEffect(() => {
    const enableVideo = async () => {
        if (videoEnabled) {
            try {
                const track = await createLocalVideoTrack({
                    deviceId: "", // Use default or selected
                    resolution: { width: 1280, height: 720 },
                });
                setVideoTrack(track);
                trackRef.current = track; // Store in ref for cleanup
            } catch (e) {
                console.error("Failed to acquire video track", e);
                setVideoEnabled(false);
            }
        } else {
            if (trackRef.current) {
                trackRef.current.stop();
                trackRef.current = undefined;
                setVideoTrack(undefined);
            }
        }
    };
    enableVideo();
    return () => {
        // Robust cleanup on unmount or dependency change
        if (trackRef.current) {
            trackRef.current.stop();
            trackRef.current = undefined;
        }
    };
  }, [videoEnabled]);

  const toggleVideo = () => setVideoEnabled(!videoEnabled);
  const toggleAudio = () => setAudioEnabled(!audioEnabled);

  return (
    <div className="flex flex-col items-center justify-center p-6 space-y-6 bg-background rounded-lg border shadow-sm max-w-md mx-auto mt-10">
      <h2 className="text-2xl font-bold">Ready to join?</h2>
      
      <div className="relative aspect-video w-full bg-muted rounded-md overflow-hidden flex items-center justify-center">
        {videoTrack && videoEnabled ? (
          <VideoTrackPreview track={videoTrack} />
        ) : (
          <div className="flex flex-col items-center text-muted-foreground">
             <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                 <span className="text-2xl font-bold">{username.charAt(0).toUpperCase()}</span>
             </div>
             <p>Camera is off</p>
          </div>
        )}
        
        <div className="absolute bottom-4 flex bg-black/50 p-2 rounded-full space-x-2 backdrop-blur-sm">
             <Button 
                variant={audioEnabled ? "secondary" : "destructive"} 
                size="icon" 
                className="h-10 w-10 rounded-full"
                onClick={toggleAudio}
             >
                {audioEnabled ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
             </Button>
             <Button 
                variant={videoEnabled ? "secondary" : "destructive"} 
                size="icon"
                className="h-10 w-10 rounded-full"
                 onClick={toggleVideo}
             >
                {videoEnabled ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
             </Button>
        </div>
      </div>

      <div className="w-full flex justify-center">
          <Button size="lg" className="w-full" onClick={() => onJoin({ audioEnabled, videoEnabled })}>
            Join Meeting
          </Button>
      </div>
    </div>
  );
}

function VideoTrackPreview({ track }: { track: LocalTrack }) {
    const videoRef = (element: HTMLVideoElement | null) => {
        if (element) {
            track.attach(element);
        }
    };
    return <video ref={videoRef} className="w-full h-full object-cover -scale-x-100" />
}
