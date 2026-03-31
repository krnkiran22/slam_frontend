"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ArrowLeft, Play, Pause, RotateCcw } from "lucide-react";
import { api, Run, PoseFrame } from "@/lib/api";

const TrajectoryViewer3D = dynamic(
  () => import("@/components/TrajectoryViewer3D").then(m => ({ default: m.TrajectoryViewer3D })),
  { ssr: false, loading: () => <div className="h-full flex items-center justify-center text-muted-foreground text-[13px]">Loading 3D…</div> }
);

export default function DemoPage() {
  const { id } = useParams<{ id: string }>();
  const [run, setRun] = useState<Run | null>(null);
  const [poses, setPoses] = useState<PoseFrame[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [r, p] = await Promise.all([
        api.getRun(id),
        api.getPoses(id, 0, 2000),
      ]);
      setRun(r);
      setPoses(p.frames);
      setLoading(false);
    };
    load();
  }, [id]);

  const handleTimeUpdate = useCallback(() => {
    if (!videoRef.current || poses.length === 0) return;
    const time = videoRef.current.currentTime;
    const fps = poses.length > 1
      ? 1 / (poses[1].timestamp_s - poses[0].timestamp_s)
      : 30;
    const frame = Math.min(Math.floor(time * fps), poses.length - 1);
    setCurrentFrame(frame);
  }, [poses]);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const restart = () => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = 0;
    setCurrentFrame(0);
    videoRef.current.play();
    setIsPlaying(true);
  };

  const currentPose = poses[currentFrame];
  const trailPoses = poses.slice(0, currentFrame + 1);

  if (loading) return (
    <div className="h-screen flex items-center justify-center">
      <div className="text-muted-foreground text-[13px]">Loading demo…</div>
    </div>
  );

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-4">
          <Link href={`/runs/${id}`} className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft size={13} /> Back
          </Link>
          <div className="h-4 w-px bg-border" />
          <h1 className="text-[15px] font-semibold">Head Trajectory Demo</h1>
          <span className="text-[11px] font-mono text-muted-foreground">{id.slice(0, 8)}…</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={togglePlay}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium bg-foreground text-background hover:opacity-90 transition-opacity"
          >
            {isPlaying ? <Pause size={12} /> : <Play size={12} />}
            {isPlaying ? "Pause" : "Play"}
          </button>
          <button
            onClick={restart}
            className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
          >
            <RotateCcw size={14} />
          </button>
        </div>
      </div>

      {/* Split screen */}
      <div className="flex-1 grid grid-cols-2 min-h-0">
        {/* Left: Video */}
        <div className="relative border-r border-border bg-black flex items-center justify-center">
          <video
            ref={videoRef}
            src={api.videoUrl(id)}
            onTimeUpdate={handleTimeUpdate}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            className="max-w-full max-h-full object-contain"
            playsInline
          />
          <div className="absolute bottom-3 left-3 bg-black/70 backdrop-blur px-2.5 py-1.5 text-[11px] font-mono text-white">
            Egocentric Video
          </div>
        </div>

        {/* Right: 3D Trajectory */}
        <div className="relative">
          <TrajectoryViewer3D poses={poses} currentFrame={currentFrame} />

          {/* Pose info overlay */}
          {currentPose && (
            <div className="absolute top-3 left-3 bg-background/90 backdrop-blur border border-border px-3 py-2 space-y-1">
              <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Current Pose</p>
              <div className="grid grid-cols-3 gap-3 text-[11px] font-mono">
                <div>
                  <span className="text-blue-500">X</span>
                  <span className="text-foreground ml-1">{currentPose.pose.position.x.toFixed(4)}</span>
                </div>
                <div>
                  <span className="text-green-500">Y</span>
                  <span className="text-foreground ml-1">{currentPose.pose.position.y.toFixed(4)}</span>
                </div>
                <div>
                  <span className="text-orange-500">Z</span>
                  <span className="text-foreground ml-1">{currentPose.pose.position.z.toFixed(4)}</span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 text-[11px] font-mono">
                <div>
                  <span className="text-muted-foreground">R</span>
                  <span className="text-foreground ml-1">{(currentPose.pose.orientation.roll * 180 / Math.PI).toFixed(1)}°</span>
                </div>
                <div>
                  <span className="text-muted-foreground">P</span>
                  <span className="text-foreground ml-1">{(currentPose.pose.orientation.pitch * 180 / Math.PI).toFixed(1)}°</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Y</span>
                  <span className="text-foreground ml-1">{(currentPose.pose.orientation.yaw * 180 / Math.PI).toFixed(1)}°</span>
                </div>
              </div>
            </div>
          )}

          <div className="absolute bottom-3 left-3 bg-background/90 backdrop-blur border border-border px-2.5 py-1.5 text-[11px] font-mono text-muted-foreground">
            Frame {currentFrame} / {poses.length} · 3D Head Trajectory
          </div>
        </div>
      </div>

      {/* Timeline scrubber */}
      <div className="px-5 py-3 border-t border-border shrink-0">
        <input
          type="range"
          min={0}
          max={poses.length - 1 || 1}
          value={currentFrame}
          onChange={(e) => {
            const frame = parseInt(e.target.value);
            setCurrentFrame(frame);
            if (videoRef.current && poses[frame]) {
              videoRef.current.currentTime = poses[frame].timestamp_s;
            }
          }}
          className="w-full h-1 accent-foreground cursor-pointer"
        />
        <div className="flex items-center justify-between mt-1 text-[10px] font-mono text-muted-foreground">
          <span>0:00</span>
          <span>{currentPose ? `${currentPose.timestamp_s.toFixed(1)}s` : "—"}</span>
          <span>{poses.length > 0 ? `${poses[poses.length - 1].timestamp_s.toFixed(1)}s` : "—"}</span>
        </div>
      </div>
    </div>
  );
}
