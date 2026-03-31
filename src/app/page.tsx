"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Plus, RefreshCw, Trash2, ChevronRight, Video, Cpu } from "lucide-react";
import { api, Run, RunStatus } from "@/lib/api";
import { RunStatusBadge } from "@/components/RunStatusBadge";
import { NewRunModal } from "@/components/NewRunModal";
import { cn, formatDate, formatDuration } from "@/lib/utils";

const STATUS_FILTERS: { label: string; value: RunStatus | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Done", value: "done" },
  { label: "Processing", value: "processing" },
  { label: "Pending", value: "pending" },
  { label: "Failed", value: "failed" },
];

export default function RunsPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<RunStatus | "all">("all");
  const [showNewRun, setShowNewRun] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getRuns({
        limit: 50,
        status: filter === "all" ? undefined : filter,
      });
      setRuns(data.runs);
      setTotal(data.total);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh every 5s while any run is processing
  useEffect(() => {
    const hasActive = runs.some(r => r.status === "processing" || r.status === "pending");
    if (!hasActive) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [runs, load]);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    if (!confirm("Delete this run?")) return;
    setDeleting(id);
    await api.deleteRun(id);
    setDeleting(null);
    load();
  };

  // Stats
  const stats = {
    total: runs.length,
    done: runs.filter(r => r.status === "done").length,
    processing: runs.filter(r => r.status === "processing").length,
    failed: runs.filter(r => r.status === "failed").length,
  };

  return (
    <div className="min-h-[calc(100vh-3.5rem)] p-4 sm:p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Pipeline Runs</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            VIO + Scene Perception — Build Gen 4 — GPU Connected
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            aria-label="Refresh"
          >
            <RefreshCw size={14} className={cn(loading && "animate-spin")} />
          </button>
          <button
            onClick={() => setShowNewRun(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium bg-foreground text-background hover:opacity-90 transition-opacity"
          >
            <Plus size={13} />
            New Run
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6 animate-fade-in animate-fade-in-1">
        {[
          { label: "Total", value: total, color: "var(--foreground)" },
          { label: "Done", value: stats.done, color: "var(--success)" },
          { label: "Processing", value: stats.processing, color: "var(--info)" },
          { label: "Failed", value: stats.failed, color: "var(--error)" },
        ].map(s => (
          <div key={s.label} className="bg-card border border-border p-4">
            <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">{s.label}</p>
            <p className="text-2xl font-semibold tracking-tight mt-1 font-mono" style={{ color: s.color }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 mb-4 border-b border-border animate-fade-in animate-fade-in-2">
        {STATUS_FILTERS.map(f => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={cn(
              "px-3 py-2 text-[13px] font-medium border-b-2 transition-colors -mb-px",
              filter === f.value
                ? "text-foreground border-foreground"
                : "text-muted-foreground border-transparent hover:text-foreground"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="border border-border rounded-sm bg-card animate-slide-up animate-fade-in-3">
        {loading && runs.length === 0 ? (
          <div className="space-y-0 divide-y divide-border">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3.5">
                <div className="skeleton h-3 w-16 rounded" />
                <div className="skeleton h-3 w-48 rounded flex-1" />
                <div className="skeleton h-3 w-20 rounded" />
              </div>
            ))}
          </div>
        ) : runs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Cpu size={28} className="text-muted-foreground mb-3 opacity-50" />
            <p className="text-sm font-medium">No runs yet</p>
            <p className="text-[13px] text-muted-foreground mt-1">Create a new run to start processing</p>
            <button
              onClick={() => setShowNewRun(true)}
              className="mt-4 flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium bg-foreground text-background hover:opacity-90 transition-opacity"
            >
              <Plus size={13} /> New Run
            </button>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {/* Table header */}
            <div className="grid grid-cols-[1fr_120px_100px_90px_90px_32px] gap-4 px-4 py-2 text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
              <span>Run</span>
              <span>Status</span>
              <span>Frames</span>
              <span>Duration</span>
              <span>RPE RMSE</span>
              <span />
            </div>

            {runs.map((run) => (
              <Link
                key={run.id}
                href={`/runs/${run.id}`}
                className="grid grid-cols-[1fr_120px_100px_90px_90px_32px] gap-4 px-4 py-3.5 items-center interactive-row group"
              >
                {/* ID + path */}
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Video size={13} className="text-muted-foreground shrink-0" />
                    <span className="font-mono text-[12px] text-foreground truncate">
                      {run.id.slice(0, 8)}…
                    </span>
                  </div>
                  <p className="text-[12px] text-muted-foreground truncate mt-0.5 pl-5">
                    {run.video_path.split("/").pop()} · {run.created_at ? formatDate(run.created_at) : "—"}
                  </p>
                  {run.status === "processing" && (
                    <div className="mt-1.5 pl-5">
                      <div className="h-0.5 bg-border rounded-full w-48 max-w-full overflow-hidden">
                        <div
                          style={{ backgroundColor: "var(--info)", width: `${run.progress ?? 0}%` }}
                          className="h-full transition-all duration-500"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <RunStatusBadge status={run.status} showDot />

                <span className="font-mono text-[12px] text-muted-foreground">
                  {run.frame_count?.toLocaleString() ?? "—"}
                </span>

                <span className="font-mono text-[12px] text-muted-foreground">
                  {formatDuration(run.duration_s)}
                </span>

                <span className="font-mono text-[12px] text-muted-foreground">
                  {run.rpe_rmse != null ? run.rpe_rmse.toFixed(4) : "—"}
                </span>

                <div className="flex items-center justify-end gap-1">
                  <button
                    onClick={(e) => handleDelete(run.id, e)}
                    className={cn(
                      "p-1 rounded text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100",
                      deleting === run.id && "opacity-100 animate-spin"
                    )}
                    aria-label="Delete run"
                  >
                    <Trash2 size={13} />
                  </button>
                  <ChevronRight size={13} className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <NewRunModal open={showNewRun} onClose={() => setShowNewRun(false)} onCreated={load} />
    </div>
  );
}
