const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type RunStatus = "pending" | "processing" | "done" | "failed";

export interface Run {
  id: string;
  status: RunStatus;
  video_path: string;
  imu_path: string;
  output_path: string | null;
  rpe_rmse: number | null;
  frame_count: number | null;
  duration_s: number | null;
  progress: number | null;
  error_message: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface RunsResponse {
  runs: Run[];
  total: number;
}

export interface PosesResponse {
  frames: PoseFrame[];
  total: number;
}

export interface PoseFrame {
  frame_id: number;
  timestamp_s: number;
  pose: {
    position: { x: number; y: number; z: number };
    orientation: { roll: number; pitch: number; yaw: number };
  };
  objects: Array<{ class: string; conf: number; bbox: number[] }>;
  skeleton: { keypoints: number[][] } | null;
  depth_map_path: string | null;
}

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export const api = {
  getRuns: (params?: { skip?: number; limit?: number; status?: RunStatus }) => {
    const q = new URLSearchParams();
    if (params?.skip) q.set("skip", String(params.skip));
    if (params?.limit) q.set("limit", String(params.limit));
    if (params?.status) q.set("status", params.status);
    return req<RunsResponse>(`/api/runs?${q}`);
  },

  getRun: (id: string) => req<Run>(`/api/runs/${id}`),

  createRun: (video_path: string, imu_path: string) =>
    req<Run>("/api/runs", {
      method: "POST",
      body: JSON.stringify({ video_path, imu_path }),
    }),

  uploadRun: async (video: File, imu: File): Promise<Run> => {
    const form = new FormData();
    form.append("video", video);
    form.append("imu", imu);
    const res = await fetch(`${BASE}/api/runs/upload`, {
      method: "POST",
      body: form,
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json();
  },

  getPoses: (id: string, skip = 0, limit = 200) =>
    req<PosesResponse>(`/api/runs/${id}/poses?skip=${skip}&limit=${limit}`),

  deleteRun: (id: string) =>
    fetch(`${BASE}/api/runs/${id}`, { method: "DELETE" }),

  wsUrl: (id: string) =>
    `${BASE.replace(/^http/, "ws")}/ws/runs/${id}`,
};
