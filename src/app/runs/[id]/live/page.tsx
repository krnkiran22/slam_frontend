"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Radio, CheckCircle, XCircle } from "lucide-react";
import { api } from "@/lib/api";
import { RunStatusBadge } from "@/components/RunStatusBadge";
import type { RunStatus } from "@/lib/api";
import { cn } from "@/lib/utils";

interface StreamPayload {
  status: RunStatus;
  progress: number;
  frame_count: number | null;
  rpe_rmse: number | null;
  error_message?: string;
}

interface PoseSnapshot {
  x: number; y: number; z: number;
  roll: number; pitch: number; yaw: number;
}

export default function LiveStreamPage() {
  const { id } = useParams<{ id: string }>();
  const [payload, setPayload] = useState<StreamPayload | null>(null);
  const [pose, setPose] = useState<PoseSnapshot | null>(null);
  const [connected, setConnected] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const logRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const addLog = (msg: string) =>
    setLog(prev => [...prev.slice(-80), `[${new Date().toLocaleTimeString()}] ${msg}`]);

  useEffect(() => {
    const ws = new WebSocket(api.wsUrl(id));
    wsRef.current = ws;

    ws.onopen = () => { setConnected(true); addLog("Connected to stream"); };
    ws.onclose = () => { setConnected(false); addLog("Stream disconnected"); };
    ws.onerror = () => { addLog("WebSocket error"); };

    ws.onmessage = (ev) => {
      const data: StreamPayload = JSON.parse(ev.data);
      setPayload(data);
      addLog(`status=${data.status} progress=${data.progress?.toFixed(1)}% frames=${data.frame_count ?? 0}`);
    };

    return () => ws.close();
  }, [id]);

  // Fetch latest pose snapshot
  useEffect(() => {
    if (!payload?.frame_count) return;
    api.getPoses(id, Math.max(0, (payload.frame_count ?? 1) - 1), 1).then(d => {
      const last = d.frames[0];
      if (last) setPose({
        x: last.pose.position.x, y: last.pose.position.y, z: last.pose.position.z,
        roll: last.pose.orientation.roll, pitch: last.pose.orientation.pitch, yaw: last.pose.orientation.yaw,
      });
    }).catch(() => null);
  }, [id, payload?.frame_count]);

  // Auto-scroll log
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  const isDone = payload?.status === "done";
  const isFailed = payload?.status === "failed";
  const isFinished = isDone || isFailed;

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-5">
      {/* Header */}
      <div className="animate-fade-in">
        <Link href={`/runs/${id}`} className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors mb-4">
          <ArrowLeft size={13} /> Run detail
        </Link>

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Live Stream</h1>
            <p className="font-mono text-[12px] text-muted-foreground mt-0.5">{id}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className={cn(
              "flex items-center gap-1.5 text-[12px] font-medium",
              connected ? "text-green-500" : "text-muted-foreground"
            )}>
              <span className={cn(
                "w-2 h-2 rounded-full",
                connected ? "bg-green-500 animate-pulse-dot" : "bg-muted-foreground"
              )} />
              {connected ? "Connected" : "Disconnected"}
            </div>
            {payload && <RunStatusBadge status={payload.status} showDot />}
          </div>
        </div>
      </div>

      {/* Progress */}
      <div className="bg-card border border-border rounded-sm p-5 animate-slide-up animate-fade-in-1">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
            Pipeline Progress
          </span>
          <span className="text-[13px] font-mono text-foreground">
            {payload?.progress?.toFixed(1) ?? "0.0"}%
          </span>
        </div>
        <div className="h-1.5 bg-border rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500",
              isDone ? "bg-green-500" : isFailed ? "bg-destructive" : "bg-blue-500"
            )}
            style={{ width: `${payload?.progress ?? 0}%` }}
          />
        </div>

        {isFinished && (
          <div className="mt-4 flex items-center gap-2">
            {isDone ? (
              <><CheckCircle size={15} className="text-green-500" /><span className="text-[13px] text-green-600 dark:text-green-400 font-medium">Pipeline complete</span></>
            ) : (
              <><XCircle size={15} className="text-destructive" /><span className="text-[13px] text-destructive font-medium">{payload?.error_message ?? "Pipeline failed"}</span></>
            )}
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 animate-fade-in animate-fade-in-2">
        {[
          { label: "Frames Processed", value: payload?.frame_count?.toLocaleString() ?? "—" },
          { label: "RPE RMSE", value: payload?.rpe_rmse != null ? payload.rpe_rmse.toFixed(6) : "—" },
          { label: "Status", value: payload?.status ?? "Waiting…" },
        ].map(s => (
          <div key={s.label} className="bg-card border border-border rounded-sm px-4 py-3">
            <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">{s.label}</p>
            <p className="text-[13px] font-mono text-foreground mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Live pose */}
      {pose && (
        <div className="bg-card border border-border rounded-sm animate-fade-in animate-fade-in-3">
          <div className="px-5 py-3.5 border-b border-border flex items-center gap-2">
            <Radio size={13} className="text-blue-500 animate-pulse-dot" />
            <h2 className="text-[13px] font-semibold">Live Head Pose</h2>
          </div>
          <div className="p-5 grid grid-cols-3 gap-4">
            {[
              { label: "X", value: pose.x, color: "text-blue-500" },
              { label: "Y", value: pose.y, color: "text-green-500" },
              { label: "Z", value: pose.z, color: "text-orange-500" },
              { label: "Roll", value: pose.roll, color: "text-purple-500" },
              { label: "Pitch", value: pose.pitch, color: "text-pink-500" },
              { label: "Yaw", value: pose.yaw, color: "text-cyan-500" },
            ].map(p => (
              <div key={p.label}>
                <p className={cn("text-[11px] font-medium uppercase tracking-widest", p.color)}>{p.label}</p>
                <p className="font-mono text-[15px] font-semibold text-foreground mt-0.5">
                  {p.value.toFixed(4)}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {p.label.length > 1 ? "rad" : "m"}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Event log */}
      <div className="bg-card border border-border rounded-sm animate-fade-in animate-fade-in-4">
        <div className="px-5 py-3 border-b border-border">
          <h2 className="text-[13px] font-semibold">Event Log</h2>
        </div>
        <div
          ref={logRef}
          className="h-48 overflow-y-auto p-4 font-mono text-[11px] text-muted-foreground space-y-0.5"
        >
          {log.length === 0 ? (
            <p className="text-muted-foreground">Waiting for events…</p>
          ) : (
            log.map((l, i) => (
              <p key={i} className={cn(
                "leading-relaxed",
                l.includes("status=done") && "text-green-500",
                l.includes("status=failed") && "text-destructive",
                l.includes("Connected") && "text-blue-500",
              )}>{l}</p>
            ))
          )}
        </div>
      </div>

      {isDone && (
        <Link
          href={`/runs/${id}`}
          className="block w-full text-center py-2.5 text-[13px] font-medium bg-foreground text-background rounded-md hover:opacity-90 transition-opacity animate-slide-up"
        >
          View Results →
        </Link>
      )}
    </div>
  );
}
