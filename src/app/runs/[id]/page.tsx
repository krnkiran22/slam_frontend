"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import dynamic from "next/dynamic";
import { ArrowLeft, Radio, RotateCcw, AlertCircle, Play, Pause } from "lucide-react";
import { api, Run, PoseFrame } from "@/lib/api";
import { RunStatusBadge } from "@/components/RunStatusBadge";
import { cn, formatDate, formatDuration } from "@/lib/utils";

const TrajectoryViewer3D = dynamic(
  () => import("@/components/TrajectoryViewer3D").then(m => ({ default: m.TrajectoryViewer3D })),
  { ssr: false, loading: () => <div className="h-full flex items-center justify-center text-muted-foreground text-[13px]">Loading 3D viewer…</div> }
);

export default function RunDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [run, setRun] = useState<Run | null>(null);
  const [poses, setPoses] = useState<PoseFrame[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeLines, setActiveLines] = useState({ x: true, y: true, z: true });
  const [currentFrame, setCurrentFrame] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [runData, posesData] = await Promise.all([
          api.getRun(id),
          api.getPoses(id, 0, 2000),
        ]);
        setRun(runData);
        setPoses(posesData.frames);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load run");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  useEffect(() => {
    if (!run || run.status !== "processing") return;
    const t = setInterval(async () => {
      const [r, p] = await Promise.all([api.getRun(id), api.getPoses(id, 0, 2000)]);
      setRun(r); setPoses(p.frames);
    }, 3000);
    return () => clearInterval(t);
  }, [run, id]);

  const handleTimeUpdate = useCallback(() => {
    if (!videoRef.current || poses.length === 0) return;
    const time = videoRef.current.currentTime;
    const fps = poses.length > 1
      ? 1 / Math.max(poses[1].timestamp_s - poses[0].timestamp_s, 0.001)
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

  const chartData = poses.map(f => ({
    t: f.timestamp_s.toFixed(1),
    x: +f.pose.position.x.toFixed(3),
    y: +f.pose.position.y.toFixed(3),
    z: +f.pose.position.z.toFixed(3),
  }));

  const currentPose = poses[currentFrame];

  if (loading) return (
    <div className="max-w-7xl mx-auto p-6 space-y-4">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="skeleton h-10 rounded-sm" />
      ))}
    </div>
  );

  if (error || !run) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
      <AlertCircle size={28} className="text-destructive" />
      <p className="text-sm text-muted-foreground">{error || "Run not found"}</p>
      <Link href="/" className="text-[13px] font-medium hover:underline">← Back to runs</Link>
    </div>
  );

  const isDone = run.status === "done";

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft size={13} /> Runs
          </Link>
          <div className="h-4 w-px bg-border" />
          <h1 className="text-[14px] font-semibold font-mono">{id.slice(0, 8)}…</h1>
          <RunStatusBadge status={run.status} showDot />
        </div>

        <div className="flex items-center gap-3 text-[12px] font-mono text-muted-foreground">
          <span>{run.frame_count?.toLocaleString() ?? "—"} frames</span>
          <div className="h-3 w-px bg-border" />
          <span>{formatDuration(run.duration_s)}</span>
          {run.rpe_rmse != null && (
            <>
              <div className="h-3 w-px bg-border" />
              <span>RPE {run.rpe_rmse.toFixed(6)}</span>
            </>
          )}
          <div className="h-3 w-px bg-border" />
          <span>{run.created_at ? formatDate(run.created_at) : "—"}</span>
        </div>
      </div>

      {/* Progress bar */}
      {run.status === "processing" && (
        <div className="px-5 py-2 border-b border-border shrink-0">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">Processing</span>
            <span className="text-[11px] font-mono text-muted-foreground">{run.progress?.toFixed(0) ?? 0}%</span>
          </div>
          <div className="h-1 bg-border rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 transition-all duration-500" style={{ width: `${run.progress ?? 0}%` }} />
          </div>
        </div>
      )}

      {/* Error */}
      {run.status === "failed" && run.error_message && (
        <div className="px-5 py-2 border-b border-border shrink-0 bg-destructive/10 text-[13px] text-destructive">
          <strong>Error:</strong> {run.error_message}
        </div>
      )}

      {/* Main content: side-by-side video + 3D */}
      {isDone && poses.length > 0 ? (
        <>
          <div className="flex-1 grid grid-cols-2 min-h-0">
            {/* LEFT: Video */}
            <div className="relative border-r border-border bg-black flex items-center justify-center overflow-hidden">
              <video
                ref={videoRef}
                src={api.videoUrl(id)}
                onTimeUpdate={handleTimeUpdate}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                className="w-full h-full object-contain"
                playsInline
                crossOrigin="anonymous"
              />

              {/* Playback controls overlay */}
              <div className="absolute bottom-3 left-3 flex items-center gap-2">
                <button
                  onClick={togglePlay}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium bg-white/90 text-black hover:bg-white transition-colors rounded-sm"
                >
                  {isPlaying ? <Pause size={12} /> : <Play size={12} />}
                  {isPlaying ? "Pause" : "Play"}
                </button>
                <button
                  onClick={restart}
                  className="p-1.5 bg-white/70 hover:bg-white text-black transition-colors rounded-sm"
                >
                  <RotateCcw size={13} />
                </button>
              </div>

              <div className="absolute top-3 left-3 bg-black/70 backdrop-blur px-2.5 py-1.5 text-[11px] font-medium text-white">
                Egocentric Video
              </div>
            </div>

            {/* RIGHT: 3D Trajectory */}
            <div className="relative">
              <TrajectoryViewer3D
                poses={poses}
                currentFrame={currentFrame}
                followCamera={true}
              />

              {/* Pose overlay */}
              {currentPose && (
                <div className="absolute top-3 left-3 bg-black/80 backdrop-blur border border-white/10 px-3 py-2 space-y-1.5">
                  <p className="text-[10px] font-medium uppercase tracking-widest text-white/50">Live Pose</p>
                  <div className="grid grid-cols-3 gap-3 text-[11px] font-mono">
                    <div>
                      <span className="text-blue-400">X</span>
                      <span className="text-white ml-1">{currentPose.pose.position.x.toFixed(3)}</span>
                    </div>
                    <div>
                      <span className="text-green-400">Y</span>
                      <span className="text-white ml-1">{currentPose.pose.position.y.toFixed(3)}</span>
                    </div>
                    <div>
                      <span className="text-orange-400">Z</span>
                      <span className="text-white ml-1">{currentPose.pose.position.z.toFixed(3)}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-[11px] font-mono">
                    <div>
                      <span className="text-white/40">R</span>
                      <span className="text-white ml-1">{(currentPose.pose.orientation.roll * 180 / Math.PI).toFixed(1)}°</span>
                    </div>
                    <div>
                      <span className="text-white/40">P</span>
                      <span className="text-white ml-1">{(currentPose.pose.orientation.pitch * 180 / Math.PI).toFixed(1)}°</span>
                    </div>
                    <div>
                      <span className="text-white/40">Y</span>
                      <span className="text-white ml-1">{(currentPose.pose.orientation.yaw * 180 / Math.PI).toFixed(1)}°</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="absolute bottom-3 left-3 bg-black/70 backdrop-blur px-2.5 py-1.5 text-[11px] font-mono text-white/70">
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
        </>
      ) : (
        /* Fallback: scrollable detail view for non-done runs or no poses */
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-5">
            {/* Processing view */}
            {(run.status === "processing" || run.status === "pending") && (
              <div className="h-64 flex flex-col items-center justify-center gap-3">
                <RotateCcw size={24} className="animate-spin text-muted-foreground" />
                <p className="text-[13px] text-muted-foreground">Processing pipeline running…</p>
                <Link
                  href={`/runs/${id}/live`}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium border border-border rounded-md hover:bg-secondary transition-colors"
                >
                  <Radio size={13} className="text-blue-500 animate-pulse" />
                  Live view
                </Link>
              </div>
            )}

            {/* Chart */}
            {chartData.length > 0 && (
              <div className="bg-card border border-border rounded-sm">
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
                  <div>
                    <h2 className="text-[13px] font-semibold">6DoF Position Trajectory</h2>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{poses.length} frames</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {(["x", "y", "z"] as const).map(axis => (
                      <button
                        key={axis}
                        onClick={() => setActiveLines(a => ({ ...a, [axis]: !a[axis] }))}
                        className={cn(
                          "text-[11px] font-mono font-medium px-2 py-0.5 rounded-sm border transition-opacity",
                          axis === "x" && "border-blue-500 text-blue-500",
                          axis === "y" && "border-green-500 text-green-500",
                          axis === "z" && "border-orange-500 text-orange-500",
                          !activeLines[axis] && "opacity-30"
                        )}
                      >
                        {axis.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="p-5">
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis
                        dataKey="t"
                        tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                        tickLine={false}
                        label={{ value: "Time (s)", position: "insideBottom", offset: -2, fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "2px",
                          fontSize: 12,
                          fontFamily: "var(--font-mono)",
                          color: "hsl(var(--foreground))",
                        }}
                        formatter={(v: number) => v.toFixed(4)}
                      />
                      {activeLines.x && <Line type="monotone" dataKey="x" stroke="#3b82f6" strokeWidth={1.5} dot={false} name="X (m)" />}
                      {activeLines.y && <Line type="monotone" dataKey="y" stroke="#22c55e" strokeWidth={1.5} dot={false} name="Y (m)" />}
                      {activeLines.z && <Line type="monotone" dataKey="z" stroke="#f97316" strokeWidth={1.5} dot={false} name="Z (m)" />}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Object Detections */}
            {poses.length > 0 && (
              <div className="bg-card border border-border rounded-sm">
                <div className="px-5 py-3.5 border-b border-border">
                  <h2 className="text-[13px] font-semibold">Object Detections — Last Frame</h2>
                </div>
                <div className="p-5">
                  {poses[poses.length - 1]?.objects?.length > 0 ? (
                    <div className="space-y-2">
                      {poses[poses.length - 1].objects.map((obj, i) => (
                        <div key={i} className="flex items-center justify-between text-[12px]">
                          <span className="font-medium capitalize">{obj.class}</span>
                          <div className="flex items-center gap-4">
                            <span className="font-mono text-muted-foreground">conf {(obj.conf * 100).toFixed(0)}%</span>
                            <span className="font-mono text-muted-foreground text-[11px]">[{obj.bbox.map(v => Math.round(v)).join(", ")}]</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[13px] text-muted-foreground">No objects detected</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
