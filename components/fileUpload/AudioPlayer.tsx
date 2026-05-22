// components/file-upload/AudioPlayer.tsx
import { useRef, useState, useEffect } from 'react';
import { Play, Pause, Volume2, VolumeX } from "@/lib/icons";
import { FastForward } from "lucide-react";
import {Button} from "@/components/ui/button";
import {Slider} from "@/components/ui/slider";
import { cn } from "@/lib/utils/helpers/cn";

interface AudioPlayerProps {
    url: string;
}

export const AudioPlayer = ({ url }: AudioPlayerProps) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [speed, setSpeed] = useState(1);
    const [volume, setVolume] = useState(1);
    const [isMuted, setIsMuted] = useState(false);
    const audioRef = useRef<HTMLAudioElement>(null);

    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.playbackRate = speed;
        }
    }, [speed]);

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const onTimeUpdate = () => setCurrentTime(audio.currentTime);
        const onDurationChange = () => setDuration(audio.duration);
        const onEnded = () => setIsPlaying(false);

        audio.addEventListener('timeupdate', onTimeUpdate);
        audio.addEventListener('durationchange', onDurationChange);
        audio.addEventListener('ended', onEnded);

        return () => {
            audio.removeEventListener('timeupdate', onTimeUpdate);
            audio.removeEventListener('durationchange', onDurationChange);
            audio.removeEventListener('ended', onEnded);
        };
    }, []);

    const togglePlay = () => {
        if (isPlaying) {
            audioRef.current?.pause();
        } else {
            audioRef.current?.play();
        }
        setIsPlaying(!isPlaying);
    };

    const handleSeek = (value: number[]) => {
        if (audioRef.current) {
            audioRef.current.currentTime = value[0];
            setCurrentTime(value[0]);
        }
    };

    const handleVolumeChange = (value: number[]) => {
        if (audioRef.current) {
            const newVolume = value[0];
            audioRef.current.volume = newVolume;
            setVolume(newVolume);
            setIsMuted(newVolume === 0);
        }
    };

    const toggleMute = () => {
        if (audioRef.current) {
            const newMuted = !isMuted;
            audioRef.current.muted = newMuted;
            setIsMuted(newMuted);
        }
    };

    const cycleSpeed = () => {
        const speeds = [0.5, 1, 1.5, 2];
        const nextIndex = (speeds.indexOf(speed) + 1) % speeds.length;
        setSpeed(speeds[nextIndex]);
    };

    const formatTime = (time: number) => {
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60);
        return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
    };

    return (
        <div className="w-full max-w-md mx-auto bg-card/50 backdrop-blur-sm border border-border/50 rounded-xl p-4 shadow-lg">
            <audio ref={audioRef} src={url} />
            
            <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between gap-4">
                    <Button
                        size="icon"
                        variant="default"
                        className="h-12 w-12 rounded-full shadow-md hover:scale-105 transition-transform"
                        onClick={togglePlay}
                        disabled={!url}
                    >
                        {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6 ml-1" />}
                    </Button>

                    <div className="flex-1 space-y-1">
                        <Slider
                            value={[currentTime]}
                            max={duration || 100}
                            step={0.1}
                            onValueChange={handleSeek}
                            className="cursor-pointer"
                        />
                        <div className="flex justify-between text-xs text-muted-foreground font-mono">
                            <span>{formatTime(currentTime)}</span>
                            <span>{formatTime(duration)}</span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center justify-between border-t border-border/50 pt-3">
                    <div className="flex items-center gap-2 group">
                        <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
                            onClick={toggleMute}
                        >
                            {isMuted || volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                        </Button>
                        <div className="w-20 hidden group-hover:block transition-all">
                            <Slider
                                value={[isMuted ? 0 : volume]}
                                max={1}
                                step={0.01}
                                onValueChange={handleVolumeChange}
                            />
                        </div>
                    </div>

                    <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs font-medium text-muted-foreground hover:text-foreground h-8"
                        onClick={cycleSpeed}
                    >
                        <FastForward className="h-3 w-3 mr-1" />
                        {speed}x
                    </Button>
                </div>
            </div>
        </div>
    );
};