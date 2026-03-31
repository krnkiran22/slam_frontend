"use client";

import { useState } from "react";
import { X, Play } from "lucide-react";
import { api } from "@/lib/api";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function NewRunModal({ open, onClose, onCreated }: Props) {
  const [videoPath, setVideoPath] = useState("");
  const [imuPath, setImuPath] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!videoPath || !imuPath) { setError("Both paths are required"); return; }
    setError("");
    setLoading(true);
    try {
      await api.createRun(videoPath, imuPath);
      setVideoPath(""); setImuPath("");
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create run");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 bg-card border border-border rounded-sm shadow-xl w-full max-w-md animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-[15px] font-semibold">New Pipeline Run</h2>
          <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground transition-colors">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-[11px] font-medium uppercase tracking-widest text-muted-foreground mb-1.5">
              Video Path
            </label>
            <input
              type="text"
              value={videoPath}
              onChange={e => setVideoPath(e.target.value)}
              placeholder="/mnt/pendrive/video.mp4"
              className="w-full bg-background border border-border rounded-sm px-3 py-2 text-[13px] font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring transition"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium uppercase tracking-widest text-muted-foreground mb-1.5">
              IMU CSV Path
            </label>
            <input
              type="text"
              value={imuPath}
              onChange={e => setImuPath(e.target.value)}
              placeholder="/mnt/pendrive/imu.csv"
              className="w-full bg-background border border-border rounded-sm px-3 py-2 text-[13px] font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring transition"
            />
          </div>

          {error && (
            <p className="text-[12px] text-destructive bg-destructive/10 border border-destructive/20 rounded-sm px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-3 py-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-1.5 px-4 py-1.5 text-[13px] font-medium bg-foreground text-background rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              <Play size={12} />
              {loading ? "Starting…" : "Start Run"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
