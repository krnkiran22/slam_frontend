"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import dynamic from "next/dynamic";
import { ArrowLeft, Radio, RotateCcw, AlertCircle, Box } from "lucide-react";
import { api, Run, PoseFrame } from "@/lib/api";
import { RunStatusBadge } from "@/components/RunStatusBadge";
import { cn, formatDate, formatDuration } from "@/lib/utils";

const TrajectoryViewer3D = dynamic(
  () => import("@/components/TrajectoryViewer3D").then(m => ({ default: m.TrajectoryViewer3D })),
  { ssr: false, loading: () => <div className="h-[420px] flex items-center justify-center text-muted-foreground text-[13px]">Loading 3D viewer…</div> }
);

export default function RunDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [run, setRun] = useState<Run | null>(null);
  const [poses, setPoses] = useState<PoseFrame[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeLines, setActiveLines] = useState({ x: true, y: true, z: true });

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [runData, posesData] = await Promise.all([
          api.getRun(id),
          api.getPoses(id, 0, 500),
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

  // Auto-refresh if still processing
  useEffect(() => {
    if (!run || run.status !== "processing") return;
    const t = setInterval(async () => {
      const [r, p] = await Promise.all([api.getRun(id), api.getPoses(id, 0, 500)]);
      setRun(r); setPoses(p.frames);
    }, 3000);
    return () => clearInterval(t);
  }, [run, id]);

  const chartData = poses.map(f => ({
    t: f.timestamp_s.toFixed(1),
    x: +f.pose.position.x.toFixed(3),
    y: +f.pose.position.y.toFixed(3),
    z: +f.pose.position.z.toFixed(3),
  }));

  if (loading) return (
    <div className="max-w-5xl mx-auto p-6 space-y-4">
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

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-5">
      {/* Back + header */}
      <div className="animate-fade-in">
        <Link href="/" className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors mb-4">
          <ArrowLeft size={13} /> All runs
        </Link>

        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold tracking-tight font-mono">{id.slice(0, 8)}…</h1>
              <RunStatusBadge status={run.status} showDot />
            </div>
            <p className="text-[13px] text-muted-foreground mt-1">
              Created {run.created_at ? formatDate(run.created_at) : "—"}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {run.status === "done" && (
              <Link
                href={`/runs/${id}/demo`}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium bg-foreground text-background hover:opacity-90 transition-opacity"
              >
                <Box size={13} />
                3D Demo
              </Link>
            )}
            {(run.status === "processing" || run.status === "pending") && (
              <Link
                href={`/runs/${id}/live`}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium border border-border rounded-md hover:bg-secondary transition-colors"
              >
                <Radio size={13} className="text-blue-500 animate-pulse-dot" />
                Live view
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Progress bar (if processing) */}
      {run.status === "processing" && (
        <div className="animate-fade-in animate-fade-in-1">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">Progress</span>
            <span className="text-[12px] font-mono text-muted-foreground">{run.progress?.toFixed(0) ?? 0}%</span>
          </div>
          <div className="h-1 bg-border rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all duration-500"
              style={{ width: `${run.progress ?? 0}%` }}
            />
          </div>
        </div>
      )}

      {/* Error message */}
      {run.status === "failed" && run.error_message && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-sm px-4 py-3 text-[13px] text-destructive animate-fade-in">
          <strong>Error:</strong> {run.error_message}
        </div>
      )}

      {/* Metadata grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 animate-fade-in animate-fade-in-1">
        {[
          { label: "Frames", value: run.frame_count?.toLocaleString() ?? "—" },
          { label: "Duration", value: formatDuration(run.duration_s) },
          { label: "RPE RMSE", value: run.rpe_rmse != null ? run.rpe_rmse.toFixed(6) : "—" },
          { label: "Video", value: run.video_path.split("/").pop() ?? "—" },
        ].map(m => (
          <div key={m.label} className="bg-card border border-border rounded-sm px-4 py-3">
            <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">{m.label}</p>
            <p className="text-[13px] font-mono text-foreground mt-1 truncate" title={m.value}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* Pose Timeline Chart */}
      <div className="bg-card border border-border rounded-sm animate-slide-up animate-fade-in-2">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <div>
            <h2 className="text-[13px] font-semibold">6DoF Position Trajectory</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {poses.length} frames · RPE metric (3-min windows)
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
          {chartData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-[13px] text-muted-foreground">
              {run.status === "processing" ? (
                <span className="flex items-center gap-2"><RotateCcw size={14} className="animate-spin" /> Collecting pose data…</span>
              ) : "No pose data available"}
            </div>
          ) : (
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
          )}
        </div>
      </div>

      {/* 3D Trajectory Viewer */}
      {poses.length > 0 && (
        <div className="bg-card border border-border rounded-sm animate-slide-up animate-fade-in-2">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
            <div>
              <h2 className="text-[13px] font-semibold flex items-center gap-2">
                <Box size={14} />
                3D Head Trajectory
              </h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Click &amp; drag to rotate · Scroll to zoom · Right-click to pan
              </p>
            </div>
          </div>
          <TrajectoryViewer3D poses={poses} />
        </div>
      )}

      {/* Object Detections */}
      {poses.length > 0 && (
        <div className="bg-card border border-border rounded-sm animate-slide-up animate-fade-in-3">
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
                      <span className="font-mono text-muted-foreground">
                        conf {(obj.conf * 100).toFixed(0)}%
                      </span>
                      <span className="font-mono text-muted-foreground text-[11px]">
                        [{obj.bbox.map(v => Math.round(v)).join(", ")}]
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[13px] text-muted-foreground">No objects detected in last frame</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
