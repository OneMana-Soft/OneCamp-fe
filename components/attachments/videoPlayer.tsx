"use client"

import { useRef, useState, useEffect } from "react"
import { Play, Pause, Volume2, VolumeX, Maximize, Minimize, Settings } from "@/lib/icons";
import { SkipBack, SkipForward } from "@/lib/icons";
import { Slider } from "@/components/ui/slider"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Portal } from "@radix-ui/react-portal";


interface VideoPlayerProps {
    url: string
    fileName: string
}

export default function VideoPlayer({ url, fileName}: VideoPlayerProps) {
    const videoRef = useRef<HTMLVideoElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const [isPlaying, setIsPlaying] = useState(false)
    const [currentTime, setCurrentTime] = useState(0)
    const [duration, setDuration] = useState(0)
    const [volume, setVolume] = useState(1)
    const [isMuted, setIsMuted] = useState(false)
    const [isFullscreen, setIsFullscreen] = useState(false)
    const [showControls, setShowControls] = useState(true)
    const [playbackRate, setPlaybackRate] = useState(1)

    // Control visibility timer
    useEffect(() => {
        let timer: NodeJS.Timeout

        const handleMouseMove = () => {
            setShowControls(true)
            clearTimeout(timer)
            timer = setTimeout(() => {
                if (isPlaying) {
                    setShowControls(false)
                }
            }, 3000)
        }

        const container = containerRef.current
        if (container) {
            container.addEventListener("mousemove", handleMouseMove)
            container.addEventListener("mouseleave", () => {
                if (isPlaying) {
                    setShowControls(false)
                }
            })
        }

        return () => {
            clearTimeout(timer)
            if (container) {
                container.removeEventListener("mousemove", handleMouseMove)
            }
        }
    }, [isPlaying])

    // Handle video events
    useEffect(() => {
        const video = videoRef.current
        if (!video) return

        const onTimeUpdate = () => setCurrentTime(video.currentTime)
        const onDurationChange = () => setDuration(video.duration)
        const onEnded = () => setIsPlaying(false)
        const onPlay = () => setIsPlaying(true)
        const onPause = () => setIsPlaying(false)

        video.addEventListener("timeupdate", onTimeUpdate)
        video.addEventListener("durationchange", onDurationChange)
        video.addEventListener("ended", onEnded)
        video.addEventListener("play", onPlay)
        video.addEventListener("pause", onPause)

        return () => {
            video.removeEventListener("timeupdate", onTimeUpdate)
            video.removeEventListener("durationchange", onDurationChange)
            video.removeEventListener("ended", onEnded)
            video.removeEventListener("play", onPlay)
            video.removeEventListener("pause", onPause)
        }
    }, [])

    // Handle fullscreen changes
    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(!!document.fullscreenElement)
        }

        document.addEventListener("fullscreenchange", handleFullscreenChange)
        return () => {
            document.removeEventListener("fullscreenchange", handleFullscreenChange)
        }
    }, [])

    const togglePlay = () => {
        const video = videoRef.current
        if (!video) return

        if (isPlaying) {
            video.pause()
        } else {
            video.play()
        }
    }

    const toggleMute = () => {
        const video = videoRef.current
        if (!video) return

        setIsMuted(!isMuted)
        video.muted = !isMuted
    }

    const handleVolumeChange = (value: number[]) => {
        const video = videoRef.current
        if (!video) return

        const newVolume = value[0]
        setVolume(newVolume)
        video.volume = newVolume

        if (newVolume === 0) {
            setIsMuted(true)
            video.muted = true
        } else if (isMuted) {
            setIsMuted(false)
            video.muted = false
        }
    }

    const handleSeek = (value: number[]) => {
        const video = videoRef.current
        if (!video) return

        video.currentTime = value[0]
    }

    const toggleFullscreen = () => {
        if (!containerRef.current) return

        if (!isFullscreen) {
            if (containerRef.current.requestFullscreen) {
                containerRef.current.requestFullscreen()
            }
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen()
            }
        }
    }

    const skip = (seconds: number) => {
        const video = videoRef.current
        if (!video) return

        video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + seconds))
    }

    const changePlaybackRate = (rate: number) => {
        const video = videoRef.current
        if (!video) return

        setPlaybackRate(rate)
        video.playbackRate = rate
    }

    const formatTime = (time: number) => {
        const minutes = Math.floor(time / 60)
        const seconds = Math.floor(time % 60)
        return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`
    }

    return (
        <div
            ref={containerRef}
            className="relative w-full h-full flex items-center justify-center bg-black group overflow-hidden rounded-lg shadow-2xl"
            onDoubleClick={toggleFullscreen}
            onClick={togglePlay}
        >
            <video ref={videoRef} src={url} className="max-w-full max-h-full" />

            {/* Big Play Button Overlay */}
            {!isPlaying && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-black/20 backdrop-blur-[1px]">
                    <div className="bg-white/10 backdrop-blur-md p-6 rounded-full border border-white/20 shadow-xl animate-in fade-in zoom-in duration-300">
                        <Play className="h-12 w-12 text-white fill-white" />
                    </div>
                </div>
            )}

            <div
                className={`absolute inset-0 flex flex-col justify-end transition-opacity duration-300 pointer-events-none ${
                    showControls ? "opacity-100" : "opacity-0"
                }`}
            >
                {/* Bottom controls */}
                <div 
                    className="p-4 space-y-3 bg-gradient-to-t from-black/90 via-black/60 to-transparent pt-12 pointer-events-auto"
                    onClick={(e) => e.stopPropagation()}
                >
                    <Slider
                        value={[currentTime]}
                        min={0}
                        max={duration || 100}
                        step={0.1}
                        onValueChange={handleSeek}
                        className="cursor-pointer [&>.relative>.absolute]:bg-white [&>.relative]:bg-white/30"
                    />

                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                            <Button variant="ghost" size="icon" onClick={() => skip(-10)} className="text-white hover:bg-white/20 rounded-full h-8 w-8">
                                <SkipBack className="h-4 w-4" />
                            </Button>

                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    togglePlay()
                                }}
                                className="text-white hover:bg-white/20 rounded-full h-10 w-10"
                            >
                                {isPlaying ? <Pause className="h-5 w-5 fill-current" /> : <Play className="h-5 w-5 fill-current" />}
                            </Button>

                            <Button variant="ghost" size="icon" onClick={() => skip(10)} className="text-white hover:bg-white/20 rounded-full h-8 w-8">
                                <SkipForward className="h-4 w-4" />
                            </Button>

                            <span className="text-white/80 text-xs font-medium ml-2 font-mono">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
                        </div>

                        <div className="flex items-center space-x-2">
                            <div className="flex items-center space-x-2 group">
                                <Button variant="ghost" size="icon" onClick={toggleMute} className="text-white hover:bg-white/20 rounded-full h-8 w-8">
                                    {isMuted || volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                                </Button>

                                <div className="w-20 hidden group-hover:block transition-all duration-300">
                                    <Slider
                                        value={[isMuted ? 0 : volume]}
                                        min={0}
                                        max={1}
                                        step={0.01}
                                        onValueChange={handleVolumeChange}
                                        className="[&>.relative>.absolute]:bg-white [&>.relative]:bg-white/30"
                                    />
                                </div>
                            </div>

                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="text-white hover:bg-white/20 rounded-full h-8 w-8">
                                        <Settings className="h-4 w-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="bg-black/90 border-white/10 text-white backdrop-blur-xl">
                                    <DropdownMenuItem onClick={() => changePlaybackRate(0.5)} className="focus:bg-white/20 focus:text-white cursor-pointer">
                                        {playbackRate === 0.5 ? "✓ " : ""}0.5x
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => changePlaybackRate(1)} className="focus:bg-white/20 focus:text-white cursor-pointer">
                                        {playbackRate === 1 ? "✓ " : ""}1x (Normal)
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => changePlaybackRate(1.5)} className="focus:bg-white/20 focus:text-white cursor-pointer">
                                        {playbackRate === 1.5 ? "✓ " : ""}1.5x
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => changePlaybackRate(2)} className="focus:bg-white/20 focus:text-white cursor-pointer">
                                        {playbackRate === 2 ? "✓ " : ""}2x
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>

                            <Button variant="ghost" size="icon" onClick={toggleFullscreen} className="text-white hover:bg-white/20 rounded-full h-8 w-8">
                                {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

