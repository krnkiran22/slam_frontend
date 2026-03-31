"use client";

import { useRef, useState } from "react";
import { X, Play, Upload } from "lucide-react";
import { api } from "@/lib/api";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function NewRunModal({ open, onClose, onCreated }: Props) {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [imuFile, setImuFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const videoRef = useRef<HTMLInputElement>(null);
  const imuRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!videoFile || !imuFile) { setError("Both files are required"); return; }
    setError("");
    setLoading(true);
    try {
      await api.uploadRun(videoFile, imuFile);
      setVideoFile(null);
      setImuFile(null);
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
      <div className="relative z-10 bg-card border border-border shadow-2xl w-full max-w-md animate-slide-up">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-[15px] font-semibold">New Pipeline Run</h2>
          <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground transition-colors">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-[11px] font-medium uppercase tracking-widest text-muted-foreground mb-1.5">
              Video File
            </label>
            <input
              ref={videoRef}
              type="file"
              accept="video/mp4,video/*"
              onChange={e => setVideoFile(e.target.files?.[0] ?? null)}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => videoRef.current?.click()}
              className="w-full flex items-center gap-2 bg-background border border-input px-3 py-2.5 text-[13px] font-mono text-left hover:border-ring transition"
            >
              <Upload size={14} className="text-muted-foreground shrink-0" />
              <span className={videoFile ? "text-foreground" : "text-muted-foreground"}>
                {videoFile ? videoFile.name : "Choose video.mp4"}
              </span>
              {videoFile && (
                <span className="ml-auto text-[11px] text-muted-foreground">
                  {(videoFile.size / 1024 / 1024).toFixed(1)} MB
                </span>
              )}
            </button>
          </div>

          <div>
            <label className="block text-[11px] font-medium uppercase tracking-widest text-muted-foreground mb-1.5">
              IMU CSV File
            </label>
            <input
              ref={imuRef}
              type="file"
              accept=".csv,text/csv"
              onChange={e => setImuFile(e.target.files?.[0] ?? null)}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => imuRef.current?.click()}
              className="w-full flex items-center gap-2 bg-background border border-input px-3 py-2.5 text-[13px] font-mono text-left hover:border-ring transition"
            >
              <Upload size={14} className="text-muted-foreground shrink-0" />
              <span className={imuFile ? "text-foreground" : "text-muted-foreground"}>
                {imuFile ? imuFile.name : "Choose imu.csv"}
              </span>
              {imuFile && (
                <span className="ml-auto text-[11px] text-muted-foreground">
                  {(imuFile.size / 1024).toFixed(1)} KB
                </span>
              )}
            </button>
          </div>

          {error && (
            <p className="text-[12px] px-3 py-2 border" style={{
              color: "var(--error-foreground)",
              backgroundColor: "var(--error-muted)",
              borderColor: "color-mix(in srgb, var(--error) 30%, transparent)",
            }}>
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-3 py-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !videoFile || !imuFile}
              className="flex items-center gap-1.5 px-4 py-1.5 text-[13px] font-medium bg-foreground text-background hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              <Play size={12} />
              {loading ? "Uploading…" : "Start Run"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
