"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";
import dynamic from "next/dynamic";
import {
  ArrowLeft, Radio, RotateCcw, AlertCircle, Play, Pause,
  Box, Eye, Activity, Crosshair, Ruler,
} from "lucide-react";
import { api, Run, PoseFrame } from "@/lib/api";
import { RunStatusBadge } from "@/components/RunStatusBadge";
import { cn, formatDate, formatDuration } from "@/lib/utils";

function metersToFeetInches(m: number): string {
  const totalInches = m * 39.3701;
  const feet = Math.floor(totalInches / 12);
  const inches = Math.round(totalInches % 12);
  return `${feet}'${inches}"`;
}

interface HeightEstimate {
  estimatedHeightM: number;
  estimatedHeightFtIn: string;
  numSteps: number;
  strideLengthM: number;
  walkingSpeedMs: number;
  totalDistanceM: number;
  headBobAmplitudeCm: number;
  durationS: number;
  cadenceStepsPerMin: number;
}

function estimateHeightFromGait(poses: PoseFrame[]): HeightEstimate | null {
  if (poses.length < 60) return null;

  const y = poses.map(p => p.pose.position.y);
  const n = y.length;

  // Smooth Y with moving average
  const winSize = 7;
  const smoothY = y.map((_, i) => {
    const start = Math.max(0, i - Math.floor(winSize / 2));
    const end = Math.min(n, i + Math.ceil(winSize / 2));
    const slice = y.slice(start, end);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  });

  // Remove linear drift (detrend)
  const xMean = (n - 1) / 2;
  const yMean = smoothY.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (smoothY[i] - yMean);
    den += (i - xMean) ** 2;
  }
  const slope = den > 0 ? num / den : 0;
  const intercept = yMean - slope * xMean;
  const detrended = smoothY.map((v, i) => v - (slope * i + intercept));

  // Peak detection on detrended Y (head bob maxima = one step each)
  const peaks: number[] = [];
  for (let i = 2; i < n - 2; i++) {
    if (detrended[i] > detrended[i - 1] && detrended[i] > detrended[i - 2] &&
        detrended[i] > detrended[i + 1] && detrended[i] > detrended[i + 2]) {
      peaks.push(i);
    }
  }

  // Filter by minimum prominence (ignore noise)
  const stdDev = Math.sqrt(detrended.reduce((a, v) => a + v * v, 0) / n);
  const threshold = stdDev * 0.25;
  const significantPeaks = peaks.filter(i => detrended[i] > threshold);

  // Merge peaks that are too close (within 5 frames ≈ 0.17s)
  const mergedPeaks: number[] = [];
  for (const p of significantPeaks) {
    if (mergedPeaks.length === 0 || p - mergedPeaks[mergedPeaks.length - 1] > 5) {
      mergedPeaks.push(p);
    } else if (detrended[p] > detrended[mergedPeaks[mergedPeaks.length - 1]]) {
      mergedPeaks[mergedPeaks.length - 1] = p;
    }
  }

  const numSteps = mergedPeaks.length;
  if (numSteps < 3) return null;

  // Total horizontal distance (X-Z plane)
  let totalDist = 0;
  for (let i = 1; i < poses.length; i++) {
    const dx = poses[i].pose.position.x - poses[i - 1].pose.position.x;
    const dz = poses[i].pose.position.z - poses[i - 1].pose.position.z;
    totalDist += Math.sqrt(dx * dx + dz * dz);
  }

  // Stride length: one full stride = 2 steps (left foot + right foot)
  const numStrides = numSteps / 2;
  const strideLength = numStrides > 0 ? totalDist / numStrides : 0;

  // Height from stride: comfortable walk ratio ≈ 0.415
  // stride_length / height ≈ 0.415 (biomechanical constant)
  const estimatedHeight = strideLength / 0.415;

  const duration = poses[poses.length - 1].timestamp_s - poses[0].timestamp_s;
  const walkingSpeed = duration > 0 ? totalDist / duration : 0;
  const cadence = duration > 0 ? (numSteps / duration) * 60 : 0;

  // Average head bob amplitude
  const bobAmplitude = mergedPeaks.length > 0
    ? mergedPeaks.reduce((a, i) => a + Math.abs(detrended[i]), 0) / mergedPeaks.length
    : 0;

  return {
    estimatedHeightM: estimatedHeight,
    estimatedHeightFtIn: metersToFeetInches(estimatedHeight),
    numSteps,
    strideLengthM: strideLength,
    walkingSpeedMs: walkingSpeed,
    totalDistanceM: totalDist,
    headBobAmplitudeCm: bobAmplitude * 100,
    durationS: duration,
    cadenceStepsPerMin: cadence,
  };
}

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
    if (isPlaying) videoRef.current.pause();
    else videoRef.current.play();
    setIsPlaying(!isPlaying);
  };

  const restart = () => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = 0;
    setCurrentFrame(0);
    videoRef.current.play();
    setIsPlaying(true);
  };

  const chartData = useMemo(() => poses.map(f => ({
    t: f.timestamp_s.toFixed(1),
    x: +f.pose.position.x.toFixed(4),
    y: +f.pose.position.y.toFixed(4),
    z: +f.pose.position.z.toFixed(4),
  })), [poses]);

  const orientationData = useMemo(() => poses.map(f => ({
    t: f.timestamp_s.toFixed(1),
    roll: +(f.pose.orientation.roll * 180 / Math.PI).toFixed(2),
    pitch: +(f.pose.orientation.pitch * 180 / Math.PI).toFixed(2),
    yaw: +(f.pose.orientation.yaw * 180 / Math.PI).toFixed(2),
  })), [poses]);

  const heightEstimate = useMemo(() => estimateHeightFromGait(poses), [poses]);

  const objectSummary = useMemo(() => {
    const counts: Record<string, { count: number; avgConf: number }> = {};
    poses.forEach(p => {
      (p.objects ?? []).forEach(obj => {
        if (!counts[obj.class]) counts[obj.class] = { count: 0, avgConf: 0 };
        counts[obj.class].count += 1;
        counts[obj.class].avgConf += obj.conf;
      });
    });
    return Object.entries(counts)
      .map(([cls, v]) => ({ class: cls, count: v.count, avgConf: v.avgConf / v.count }))
      .sort((a, b) => b.count - a.count);
  }, [poses]);

  const currentPose = poses[currentFrame];
  const currentObjects = currentPose?.objects ?? [];

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
    <div className="min-h-screen bg-background overflow-y-auto">
      {/* Header bar */}
      <div className="sticky top-0 z-20 flex items-center justify-between px-5 py-3 border-b border-border bg-background/95 backdrop-blur">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft size={13} /> Runs
          </Link>
          <div className="h-4 w-px bg-border" />
          <h1 className="text-[14px] font-semibold font-mono">{id.slice(0, 8)}…</h1>
          <RunStatusBadge status={run.status} showDot />
        </div>

        {isDone && (
          <div className="flex items-center gap-2">
            <button
              onClick={togglePlay}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium bg-foreground text-background hover:opacity-90 transition-opacity rounded-sm"
            >
              {isPlaying ? <Pause size={12} /> : <Play size={12} />}
              {isPlaying ? "Pause" : "Play"}
            </button>
            <button onClick={restart} className="p-1.5 text-muted-foreground hover:text-foreground transition-colors">
              <RotateCcw size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Progress bar */}
      {run.status === "processing" && (
        <div className="px-5 py-2 border-b border-border">
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
        <div className="px-5 py-2 border-b border-border bg-destructive/10 text-[13px] text-destructive">
          <strong>Error:</strong> {run.error_message}
        </div>
      )}

      {/* ===== SIDE-BY-SIDE: Video + 3D ===== */}
      {isDone && poses.length > 0 && (
        <>
          <div className="grid grid-cols-2" style={{ height: "55vh" }}>
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
              <div className="absolute bottom-3 left-3 flex items-center gap-2">
                <button
                  onClick={togglePlay}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium bg-white/90 text-black hover:bg-white transition-colors rounded-sm"
                >
                  {isPlaying ? <Pause size={12} /> : <Play size={12} />}
                  {isPlaying ? "Pause" : "Play"}
                </button>
                <button onClick={restart} className="p-1.5 bg-white/70 hover:bg-white text-black transition-colors rounded-sm">
                  <RotateCcw size={13} />
                </button>
              </div>
              <div className="absolute top-3 left-3 bg-black/70 backdrop-blur px-2.5 py-1.5 text-[11px] font-medium text-white">
                Egocentric Video
              </div>
            </div>

            {/* RIGHT: 3D */}
            <div className="relative">
              <TrajectoryViewer3D poses={poses} currentFrame={currentFrame} followCamera={true} />

              {currentPose && (
                <div className="absolute top-3 left-3 bg-black/80 backdrop-blur border border-white/10 px-3 py-2 space-y-1.5">
                  <p className="text-[10px] font-medium uppercase tracking-widest text-white/50">Live Pose</p>
                  <div className="grid grid-cols-3 gap-3 text-[11px] font-mono">
                    <div><span className="text-blue-400">X</span><span className="text-white ml-1">{currentPose.pose.position.x.toFixed(3)}</span></div>
                    <div><span className="text-green-400">Y</span><span className="text-white ml-1">{currentPose.pose.position.y.toFixed(3)}</span></div>
                    <div><span className="text-orange-400">Z</span><span className="text-white ml-1">{currentPose.pose.position.z.toFixed(3)}</span></div>
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-[11px] font-mono">
                    <div><span className="text-white/40">R</span><span className="text-white ml-1">{(currentPose.pose.orientation.roll * 180 / Math.PI).toFixed(1)}°</span></div>
                    <div><span className="text-white/40">P</span><span className="text-white ml-1">{(currentPose.pose.orientation.pitch * 180 / Math.PI).toFixed(1)}°</span></div>
                    <div><span className="text-white/40">Y</span><span className="text-white ml-1">{(currentPose.pose.orientation.yaw * 180 / Math.PI).toFixed(1)}°</span></div>
                  </div>
                </div>
              )}

              <div className="absolute bottom-3 left-3 bg-black/70 backdrop-blur px-2.5 py-1.5 text-[11px] font-mono text-white/70">
                Frame {currentFrame} / {poses.length} · 3D Head Trajectory
              </div>
            </div>
          </div>

          {/* Timeline scrubber */}
          <div className="px-5 py-3 border-t border-b border-border">
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
      )}

      {/* Processing placeholder */}
      {(run.status === "processing" || run.status === "pending") && (
        <div className="h-64 flex flex-col items-center justify-center gap-3">
          <RotateCcw size={24} className="animate-spin text-muted-foreground" />
          <p className="text-[13px] text-muted-foreground">Processing pipeline running…</p>
          <Link
            href={`/runs/${id}/live`}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium border border-border rounded-md hover:bg-secondary transition-colors"
          >
            <Radio size={13} className="text-blue-500 animate-pulse" /> Live view
          </Link>
        </div>
      )}

      {/* ===== DATA PANELS (below the comparison) ===== */}
      {poses.length > 0 && (
        <div className="max-w-7xl mx-auto px-5 py-6 space-y-5">

          {/* Metadata grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Frames", value: run.frame_count?.toLocaleString() ?? String(poses.length), icon: Activity },
              { label: "Duration", value: formatDuration(run.duration_s), icon: Play },
              { label: "RPE RMSE", value: run.rpe_rmse != null ? run.rpe_rmse.toFixed(6) : "—", icon: Crosshair },
              { label: "Video", value: run.video_path.split("/").pop() ?? "—", icon: Eye },
            ].map(m => (
              <div key={m.label} className="bg-card border border-border rounded-sm px-4 py-3">
                <div className="flex items-center gap-1.5">
                  <m.icon size={12} className="text-muted-foreground" />
                  <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">{m.label}</p>
                </div>
                <p className="text-[13px] font-mono text-foreground mt-1 truncate" title={m.value}>{m.value}</p>
              </div>
            ))}
          </div>

          {/* Height Estimation / Biomechanical Analysis */}
          {heightEstimate && (
            <div className="bg-card border border-border rounded-sm">
              <div className="px-5 py-3.5 border-b border-border">
                <h2 className="text-[13px] font-semibold flex items-center gap-2">
                  <Ruler size={14} className="text-violet-400" />
                  Biomechanical Analysis — Height Estimation
                </h2>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Estimated from gait analysis: stride length / 0.415 (biomechanical walking constant)
                </p>
              </div>
              <div className="p-5 space-y-4">
                {/* Big height display */}
                <div className="flex items-center gap-6">
                  <div className="bg-violet-500/10 border border-violet-500/20 rounded-sm px-6 py-4 text-center">
                    <p className="text-[10px] font-medium uppercase tracking-widest text-violet-400 mb-1">Estimated Height</p>
                    <p className="text-3xl font-bold font-mono text-violet-400">{heightEstimate.estimatedHeightM.toFixed(2)}<span className="text-lg ml-1">m</span></p>
                    <p className="text-[13px] font-mono text-violet-300 mt-1">{heightEstimate.estimatedHeightFtIn}</p>
                  </div>
                  <div className="flex-1 space-y-1 text-[12px]">
                    <p className="text-muted-foreground">
                      This height is computed from your <strong className="text-foreground">walking gait pattern</strong>.
                      During walking, your head bobs up and down with each step.
                      The VIO tracks this oscillation and measures how far you travel per stride.
                    </p>
                    <p className="text-muted-foreground">
                      The ratio <code className="text-[11px] bg-secondary px-1.5 py-0.5 rounded font-mono">stride_length / height ≈ 0.415</code> is a
                      well-established biomechanical constant for comfortable walking speed.
                      If this matches your real height, it proves the VIO position data is metrically accurate.
                    </p>
                  </div>
                </div>

                {/* Gait metrics grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: "Steps Detected", value: String(heightEstimate.numSteps), unit: "steps" },
                    { label: "Stride Length", value: heightEstimate.strideLengthM.toFixed(2), unit: "m" },
                    { label: "Total Distance", value: heightEstimate.totalDistanceM.toFixed(2), unit: "m" },
                    { label: "Walking Speed", value: heightEstimate.walkingSpeedMs.toFixed(2), unit: "m/s" },
                    { label: "Cadence", value: heightEstimate.cadenceStepsPerMin.toFixed(0), unit: "steps/min" },
                    { label: "Head Bob", value: heightEstimate.headBobAmplitudeCm.toFixed(1), unit: "cm" },
                    { label: "Duration", value: heightEstimate.durationS.toFixed(1), unit: "s" },
                    { label: "Avg Step Length", value: (heightEstimate.strideLengthM / 2).toFixed(2), unit: "m" },
                  ].map(m => (
                    <div key={m.label} className="bg-secondary/30 border border-border rounded-sm px-3 py-2">
                      <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">{m.label}</p>
                      <p className="text-[14px] font-mono text-foreground mt-0.5">{m.value} <span className="text-[10px] text-muted-foreground">{m.unit}</span></p>
                    </div>
                  ))}
                </div>

                {/* Validation note */}
                <div className="bg-secondary/20 border border-border rounded-sm px-4 py-3 text-[12px] text-muted-foreground">
                  <strong className="text-foreground">How to validate:</strong> Compare the estimated height above with your actual height.
                  Normal walking cadence is 100–130 steps/min, stride length ~1.2–1.6m, speed ~1.2–1.5 m/s.
                  If these metrics are in range, the VIO is producing metrically accurate real-world measurements.
                </div>
              </div>
            </div>
          )}

          {/* X Y Z Position Chart */}
          <div className="bg-card border border-border rounded-sm">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
              <div>
                <h2 className="text-[13px] font-semibold flex items-center gap-2">
                  <Activity size={14} />
                  Position Trajectory (X, Y, Z)
                </h2>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {poses.length} frames · position in meters over time
                </p>
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
              <ResponsiveContainer width="100%" height={280}>
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
                    formatter={(v: number) => `${v.toFixed(4)} m`}
                  />
                  {isDone && currentPose && (
                    <ReferenceLine x={currentPose.timestamp_s.toFixed(1)} stroke="hsl(var(--foreground))" strokeDasharray="3 3" strokeOpacity={0.4} />
                  )}
                  {activeLines.x && <Line type="monotone" dataKey="x" stroke="#3b82f6" strokeWidth={1.5} dot={false} name="X (m)" />}
                  {activeLines.y && <Line type="monotone" dataKey="y" stroke="#22c55e" strokeWidth={1.5} dot={false} name="Y (m)" />}
                  {activeLines.z && <Line type="monotone" dataKey="z" stroke="#f97316" strokeWidth={1.5} dot={false} name="Z (m)" />}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Orientation Chart (Roll, Pitch, Yaw) */}
          <div className="bg-card border border-border rounded-sm">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
              <div>
                <h2 className="text-[13px] font-semibold flex items-center gap-2">
                  <Crosshair size={14} />
                  Orientation (Roll, Pitch, Yaw)
                </h2>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Head rotation in degrees over time
                </p>
              </div>
            </div>
            <div className="p-5">
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={orientationData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
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
                    formatter={(v: number) => `${v.toFixed(1)}°`}
                  />
                  {isDone && currentPose && (
                    <ReferenceLine x={currentPose.timestamp_s.toFixed(1)} stroke="hsl(var(--foreground))" strokeDasharray="3 3" strokeOpacity={0.4} />
                  )}
                  <Line type="monotone" dataKey="roll" stroke="#a78bfa" strokeWidth={1.5} dot={false} name="Roll (°)" />
                  <Line type="monotone" dataKey="pitch" stroke="#f472b6" strokeWidth={1.5} dot={false} name="Pitch (°)" />
                  <Line type="monotone" dataKey="yaw" stroke="#fbbf24" strokeWidth={1.5} dot={false} name="Yaw (°)" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Object Detections — Current Frame */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="bg-card border border-border rounded-sm">
              <div className="px-5 py-3.5 border-b border-border">
                <h2 className="text-[13px] font-semibold flex items-center gap-2">
                  <Eye size={14} />
                  Object Detections — Frame {currentFrame}
                </h2>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Objects detected by YOLOv8 at the current playback position
                </p>
              </div>
              <div className="p-5">
                {currentObjects.length > 0 ? (
                  <div className="space-y-2">
                    {currentObjects.map((obj, i) => (
                      <div key={i} className="flex items-center justify-between text-[12px]">
                        <div className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-violet-400" />
                          <span className="font-medium capitalize">{obj.class}</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="h-1 w-16 bg-border rounded-full overflow-hidden">
                            <div className="h-full bg-violet-400 rounded-full" style={{ width: `${obj.conf * 100}%` }} />
                          </div>
                          <span className="font-mono text-muted-foreground w-10 text-right">{(obj.conf * 100).toFixed(0)}%</span>
                          <span className="font-mono text-muted-foreground text-[10px]">[{obj.bbox.map(v => Math.round(v)).join(", ")}]</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[13px] text-muted-foreground">No objects detected in this frame</p>
                )}
              </div>
            </div>

            {/* Object Summary — Across All Frames */}
            <div className="bg-card border border-border rounded-sm">
              <div className="px-5 py-3.5 border-b border-border">
                <h2 className="text-[13px] font-semibold flex items-center gap-2">
                  <Box size={14} />
                  Object Summary — All Frames
                </h2>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Aggregated detection counts across {poses.length} frames
                </p>
              </div>
              <div className="p-5">
                {objectSummary.length > 0 ? (
                  <div className="space-y-2.5">
                    {objectSummary.slice(0, 15).map((obj, i) => (
                      <div key={i} className="flex items-center justify-between text-[12px]">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono text-muted-foreground w-5 text-right">{i + 1}.</span>
                          <span className="font-medium capitalize">{obj.class}</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="font-mono text-muted-foreground">{obj.count} detections</span>
                          <span className="font-mono text-muted-foreground">avg {(obj.avgConf * 100).toFixed(0)}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[13px] text-muted-foreground">No objects detected across frames</p>
                )}
              </div>
            </div>
          </div>

          {/* Skeleton data for current frame */}
          {currentPose?.skeleton?.keypoints && currentPose.skeleton.keypoints.length > 0 && (
            <div className="bg-card border border-border rounded-sm">
              <div className="px-5 py-3.5 border-b border-border">
                <h2 className="text-[13px] font-semibold flex items-center gap-2">
                  <Activity size={14} />
                  Body Skeleton — Frame {currentFrame}
                </h2>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  17-point COCO keypoints from ViTPose
                </p>
              </div>
              <div className="p-5">
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                  {["nose", "L eye", "R eye", "L ear", "R ear", "L shoulder", "R shoulder", "L elbow", "R elbow", "L wrist", "R wrist", "L hip", "R hip", "L knee", "R knee", "L ankle", "R ankle"].map((name, i) => {
                    const kp = currentPose.skeleton!.keypoints[i];
                    if (!kp) return null;
                    return (
                      <div key={i} className="text-[11px] font-mono bg-secondary/50 px-2 py-1.5 rounded-sm">
                        <span className="text-muted-foreground">{name}</span>
                        <div className="text-foreground">{Math.round(kp[0])}, {Math.round(kp[1])}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
