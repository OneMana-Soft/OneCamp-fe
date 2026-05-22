"use client"

import { useRef, useState, useEffect } from "react"
import { Play, Pause, Volume2, VolumeX, RotateCcw } from "@/lib/icons";
import { SkipBack, SkipForward, RotateCw } from "@/lib/icons";
import { Slider } from "@/components/ui/slider"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface AudioPlayerProps {
    url: string
}

export default function AudioPlayer({ url }: AudioPlayerProps) {
    const audioRef = useRef<HTMLAudioElement>(null)
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const [isPlaying, setIsPlaying] = useState(false)
    const [currentTime, setCurrentTime] = useState(0)
    const [duration, setDuration] = useState(0)
    const [volume, setVolume] = useState(1)
    const [isMuted, setIsMuted] = useState(false)
    const [playbackRate, setPlaybackRate] = useState(1)
    const [audioContext, setAudioContext] = useState<AudioContext | null>(null)
    const [analyser, setAnalyser] = useState<AnalyserNode | null>(null)
    const [audioSource, setAudioSource] = useState<MediaElementAudioSourceNode | null>(null)
    const [dataArray, setDataArray] = useState<Uint8Array | null>(null)
    const animationRef = useRef<number | null>(null)

    // Initialize audio context and analyzer
    useEffect(() => {
        if (!audioRef.current) return

        const initAudioContext = () => {
            const context = new (window.AudioContext || (window as any).webkitAudioContext)()
            const analyzerNode = context.createAnalyser()
            analyzerNode.fftSize = 256
            const bufferLength = analyzerNode.frequencyBinCount
            const dataArr = new Uint8Array(bufferLength)

            const source = context.createMediaElementSource(audioRef.current!)
            source.connect(analyzerNode)
            analyzerNode.connect(context.destination)

            setAudioContext(context)
            setAnalyser(analyzerNode)
            setAudioSource(source)
            setDataArray(dataArr)
        }

        // Only initialize on first interaction to comply with autoplay policies
        const handleInteraction = () => {
            if (!audioContext) {
                initAudioContext()
                document.removeEventListener("click", handleInteraction)
            }
        }

        document.addEventListener("click", handleInteraction)

        return () => {
            document.removeEventListener("click", handleInteraction)
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current)
            }
            if (audioSource) {
                audioSource.disconnect()
            }
            if (audioContext) {
                audioContext.close()
            }
        }
    }, [audioContext])

    // Handle audio events
    useEffect(() => {
        const audio = audioRef.current
        if (!audio) return

        const onTimeUpdate = () => setCurrentTime(audio.currentTime)
        const onDurationChange = () => setDuration(audio.duration)
        const onEnded = () => setIsPlaying(false)
        const onPlay = () => setIsPlaying(true)
        const onPause = () => setIsPlaying(false)

        audio.addEventListener("timeupdate", onTimeUpdate)
        audio.addEventListener("durationchange", onDurationChange)
        audio.addEventListener("ended", onEnded)
        audio.addEventListener("play", onPlay)
        audio.addEventListener("pause", onPause)

        return () => {
            audio.removeEventListener("timeupdate", onTimeUpdate)
            audio.removeEventListener("durationchange", onDurationChange)
            audio.removeEventListener("ended", onEnded)
            audio.removeEventListener("play", onPlay)
            audio.removeEventListener("pause", onPause)
        }
    }, [])

    // Draw waveform visualization
    useEffect(() => {
        if (!analyser || !dataArray || !canvasRef.current) return

        const canvas = canvasRef.current
        const canvasCtx = canvas.getContext("2d")
        if (!canvasCtx) return

        const draw = () => {
            if (!analyser || !dataArray || !canvasCtx) return

            animationRef.current = requestAnimationFrame(draw)

            analyser.getByteFrequencyData(dataArray as any)

            const WIDTH = canvas.width
            const HEIGHT = canvas.height

            canvasCtx.clearRect(0, 0, WIDTH, HEIGHT)

            const barWidth = (WIDTH / dataArray.length) * 2.5
            let barHeight
            let x = 0

            for (let i = 0; i < dataArray.length; i++) {
                barHeight = dataArray[i] / 2

                // Use gradient for waveform
                const gradient = canvasCtx.createLinearGradient(0, HEIGHT - barHeight, 0, HEIGHT)
                gradient.addColorStop(0, "hsl(var(--primary))")
                gradient.addColorStop(1, "hsl(var(--primary) / 0.5)")

                canvasCtx.fillStyle = gradient
                canvasCtx.fillRect(x, HEIGHT - barHeight, barWidth, barHeight)

                x += barWidth + 1
            }
        }

        if (isPlaying) {
            draw()
        } else if (animationRef.current) {
            cancelAnimationFrame(animationRef.current)
        }

        return () => {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current)
            }
        }
    }, [isPlaying, analyser, dataArray])

    const togglePlay = () => {
        const audio = audioRef.current
        if (!audio) return

        if (isPlaying) {
            audio.pause()
        } else {
            audio.play()
        }
    }

    const toggleMute = () => {
        const audio = audioRef.current
        if (!audio) return

        setIsMuted(!isMuted)
        audio.muted = !isMuted
    }

    const handleVolumeChange = (value: number[]) => {
        const audio = audioRef.current
        if (!audio) return

        const newVolume = value[0]
        setVolume(newVolume)
        audio.volume = newVolume

        if (newVolume === 0) {
            setIsMuted(true)
            audio.muted = true
        } else if (isMuted) {
            setIsMuted(false)
            audio.muted = false
        }
    }

    const handleSeek = (value: number[]) => {
        const audio = audioRef.current
        if (!audio) return

        audio.currentTime = value[0]
    }

    const skip = (seconds: number) => {
        const audio = audioRef.current
        if (!audio) return

        audio.currentTime = Math.max(0, Math.min(audio.duration, audio.currentTime + seconds))
    }

    const changePlaybackRate = (rate: string) => {
        const audio = audioRef.current
        if (!audio) return

        const newRate = Number.parseFloat(rate)
        setPlaybackRate(newRate)
        audio.playbackRate = newRate
    }

    const formatTime = (time: number) => {
        const minutes = Math.floor(time / 60)
        const seconds = Math.floor(time % 60)
        return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`
    }

    return (
        <div className="p-6 bg-background">
            <audio ref={audioRef} src={url} preload="metadata" />

            <div className="mb-4">
                <h3 className="text-lg font-medium truncate">{url.split("/").pop() || "Audio"}</h3>
            </div>

            <div className="h-32 mb-4">
                <canvas
                    ref={canvasRef}
                    className="w-full h-full bg-muted/30 rounded-md"
                    onClick={(e) => {
                        if (!audioRef.current || !duration) return

                        const canvas = e.currentTarget
                        const rect = canvas.getBoundingClientRect()
                        const x = e.clientX - rect.left
                        const seekPosition = (x / rect.width) * duration

                        audioRef.current.currentTime = seekPosition
                    }}
                />
            </div>

            <div className="space-y-4">
                <div className="flex items-center space-x-2">
                    <span className="text-sm text-muted-foreground w-12">{formatTime(currentTime)}</span>

                    <Slider
                        value={[currentTime]}
                        min={0}
                        max={duration || 100}
                        step={0.1}
                        onValueChange={handleSeek}
                        className="cursor-pointer"
                    />

                    <span className="text-sm text-muted-foreground w-12 text-right">{formatTime(duration)}</span>
                </div>

                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                        <Button variant="outline" size="icon" onClick={() => skip(-10)} title="Rewind 10 seconds">
                            <RotateCcw className="h-4 w-4" />
                        </Button>

                        <Button variant="outline" size="icon" onClick={() => skip(-5)}>
                            <SkipBack className="h-4 w-4" />
                        </Button>

                        <Button variant="default" size="icon" onClick={togglePlay} className="h-10 w-10">
                            {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                        </Button>

                        <Button variant="outline" size="icon" onClick={() => skip(5)}>
                            <SkipForward className="h-4 w-4" />
                        </Button>

                        <Button variant="outline" size="icon" onClick={() => skip(10)} title="Forward 10 seconds">
                            <RotateCw className="h-4 w-4" />
                        </Button>
                    </div>

                    <div className="flex items-center space-x-4">
                        <div className="flex items-center space-x-2">
                            <Button variant="ghost" size="icon" onClick={toggleMute}>
                                {isMuted || volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                            </Button>

                            <Slider
                                value={[isMuted ? 0 : volume]}
                                min={0}
                                max={1}
                                step={0.01}
                                onValueChange={handleVolumeChange}
                                className="w-24"
                            />
                        </div>

                        <Select value={playbackRate.toString()} onValueChange={changePlaybackRate}>
                            <SelectTrigger className="w-[80px]">
                                <SelectValue placeholder="Speed" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="0.5">0.5x</SelectItem>
                                <SelectItem value="0.75">0.75x</SelectItem>
                                <SelectItem value="1">1x</SelectItem>
                                <SelectItem value="1.25">1.25x</SelectItem>
                                <SelectItem value="1.5">1.5x</SelectItem>
                                <SelectItem value="2">2x</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </div>
        </div>
    )
}

