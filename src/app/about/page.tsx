import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function AboutPage() {
  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <Link href="/" className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft size={13} /> Back
      </Link>

      <div className="animate-fade-in">
        <h1 className="text-2xl font-semibold tracking-tight">Build AI — VIO Pipeline</h1>
        <p className="text-muted-foreground mt-1.5 text-[14px]">
          Visual-Inertial Odometry + Scene Perception for Build Gen 4 egocentric devices.
        </p>
      </div>

      <div className="space-y-4 animate-slide-up">
        {[
          { title: "What it does", body: "Recovers 6DoF head position from egocentric video (1080p @ 30fps, 176° FOV) and 30Hz IMU data using OpenVINS or BASALT. Runs parallel scene perception: YOLOv8 object detection, ViTPose body skeleton, and Depth Anything v2 monocular depth." },
          { title: "Metric: RPE (not ATE)", body: "Primary evaluation is Relative Pose Error over 3-minute windows — not Absolute Trajectory Error. Long-term drift is expected over 8-hour shifts. What matters is local consistency between frames." },
          { title: "Output", body: "Each run produces poses.json (one entry per frame with position, orientation, objects, skeleton, depth map path) and annotated_video.mp4 with bounding boxes, skeleton overlay, and pose data." },
          { title: "Camera — Build Gen 4", body: "Pinhole-Radtan model. fx=718.90, fy=716.34, cx=960.02, cy=558.31. Distortion: k1=-0.282, k2=0.074. Factory calibrated. Do not re-estimate." },
        ].map((s, i) => (
          <div key={s.title} className={`bg-card border border-border rounded-sm p-5 animate-fade-in animate-fade-in-${i + 1}`}>
            <h2 className="text-[13px] font-semibold mb-2">{s.title}</h2>
            <p className="text-[13px] text-muted-foreground leading-relaxed">{s.body}</p>
          </div>
        ))}
      </div>

      <div className="text-[11px] text-muted-foreground font-mono animate-fade-in">
        Backend: <a href="https://github.com/krnkiran22/slam_backend" className="hover:underline" target="_blank" rel="noopener noreferrer">github.com/krnkiran22/slam_backend</a>
      </div>
    </div>
  );
}
