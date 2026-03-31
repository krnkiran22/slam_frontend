"use client";

import { useRef, useState, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Grid, Line, Text, Billboard } from "@react-three/drei";
import * as THREE from "three";
import { PoseFrame } from "@/lib/api";

interface Props {
  poses: PoseFrame[];
  playing?: boolean;
}

function HeadMarker({ position, rotation, color }: {
  position: [number, number, number];
  rotation: [number, number, number];
  color: string;
}) {
  const groupRef = useRef<THREE.Group>(null);

  return (
    <group ref={groupRef} position={position} rotation={rotation}>
      {/* Head sphere */}
      <mesh>
        <sphereGeometry args={[0.06, 16, 16]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} />
      </mesh>
      {/* Direction arrow (forward) */}
      <mesh position={[0, 0, -0.12]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.03, 0.08, 8]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.3} />
      </mesh>
    </group>
  );
}

function TrajectoryPath({ poses }: { poses: PoseFrame[] }) {
  const points = useMemo(() =>
    poses.map(p => new THREE.Vector3(p.pose.position.x, p.pose.position.y, p.pose.position.z)),
    [poses]
  );

  if (points.length < 2) return null;

  const colors = useMemo(() =>
    poses.map((_, i) => {
      const t = i / (poses.length - 1);
      return new THREE.Color().setHSL(0.55 - t * 0.35, 0.9, 0.55);
    }),
    [poses]
  );

  return (
    <Line
      points={points}
      vertexColors={colors.map(c => [c.r, c.g, c.b] as [number, number, number])}
      lineWidth={2}
    />
  );
}

function AnimatedHead({ poses, playing }: { poses: PoseFrame[]; playing: boolean }) {
  const [frameIdx, setFrameIdx] = useState(0);
  const timeRef = useRef(0);

  useFrame((_, delta) => {
    if (!playing || poses.length === 0) return;
    timeRef.current += delta * 30;
    const idx = Math.floor(timeRef.current) % poses.length;
    setFrameIdx(idx);
  });

  if (poses.length === 0) return null;

  const pose = poses[frameIdx];
  const pos: [number, number, number] = [
    pose.pose.position.x,
    pose.pose.position.y,
    pose.pose.position.z,
  ];
  const rot: [number, number, number] = [
    pose.pose.orientation.roll,
    pose.pose.orientation.pitch,
    pose.pose.orientation.yaw,
  ];

  const trailStart = Math.max(0, frameIdx - 30);
  const trailPoses = poses.slice(trailStart, frameIdx + 1);
  const trailPoints = trailPoses.map(p =>
    new THREE.Vector3(p.pose.position.x, p.pose.position.y, p.pose.position.z)
  );

  return (
    <>
      <HeadMarker position={pos} rotation={rot} color="#22d3ee" />
      {trailPoints.length >= 2 && (
        <Line points={trailPoints} color="#22d3ee" lineWidth={3} opacity={0.6} transparent />
      )}
    </>
  );
}

function AxisLabels() {
  return (
    <>
      <Billboard position={[1.2, 0, 0]}><Text fontSize={0.08} color="#3b82f6">X</Text></Billboard>
      <Billboard position={[0, 1.2, 0]}><Text fontSize={0.08} color="#22c55e">Y</Text></Billboard>
      <Billboard position={[0, 0, 1.2]}><Text fontSize={0.08} color="#f97316">Z</Text></Billboard>
    </>
  );
}

function Scene({ poses, playing }: Props) {
  const center = useMemo(() => {
    if (poses.length === 0) return new THREE.Vector3();
    const avg = poses.reduce(
      (acc, p) => {
        acc.x += p.pose.position.x;
        acc.y += p.pose.position.y;
        acc.z += p.pose.position.z;
        return acc;
      },
      { x: 0, y: 0, z: 0 }
    );
    return new THREE.Vector3(
      avg.x / poses.length,
      avg.y / poses.length,
      avg.z / poses.length
    );
  }, [poses]);

  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 5, 5]} intensity={0.8} />
      <pointLight position={[-3, 3, -3]} intensity={0.3} color="#818cf8" />

      <Grid
        args={[10, 10]}
        position={[center.x, Math.min(...poses.map(p => p.pose.position.y), 0) - 0.1, center.z]}
        cellSize={0.2}
        cellColor="#333"
        sectionSize={1}
        sectionColor="#555"
        fadeDistance={8}
        infiniteGrid
      />

      <axesHelper args={[1]} />
      <AxisLabels />

      <TrajectoryPath poses={poses} />
      <AnimatedHead poses={poses} playing={playing ?? false} />

      {/* Start marker */}
      {poses.length > 0 && (
        <mesh position={[poses[0].pose.position.x, poses[0].pose.position.y, poses[0].pose.position.z]}>
          <sphereGeometry args={[0.04, 12, 12]} />
          <meshStandardMaterial color="#22c55e" emissive="#22c55e" emissiveIntensity={0.8} />
        </mesh>
      )}

      {/* End marker */}
      {poses.length > 1 && (
        <mesh position={[
          poses[poses.length - 1].pose.position.x,
          poses[poses.length - 1].pose.position.y,
          poses[poses.length - 1].pose.position.z,
        ]}>
          <sphereGeometry args={[0.04, 12, 12]} />
          <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={0.8} />
        </mesh>
      )}

      <OrbitControls
        target={center}
        enableDamping
        dampingFactor={0.1}
        maxDistance={15}
        minDistance={0.3}
      />
    </>
  );
}

export function TrajectoryViewer3D({ poses, playing = false }: Props) {
  const [isPlaying, setIsPlaying] = useState(playing);

  return (
    <div className="relative w-full" style={{ height: 420 }}>
      <Canvas
        camera={{ position: [2, 1.5, 2], fov: 50, near: 0.01, far: 100 }}
        style={{ background: "hsl(var(--card))" }}
      >
        <Scene poses={poses} playing={isPlaying} />
      </Canvas>

      {/* Controls overlay */}
      <div className="absolute bottom-3 left-3 flex items-center gap-2">
        <button
          onClick={() => setIsPlaying(!isPlaying)}
          className="px-3 py-1 text-[11px] font-medium bg-background/80 backdrop-blur border border-border hover:bg-secondary transition-colors"
        >
          {isPlaying ? "Pause" : "Play"}
        </button>
        <span className="text-[11px] text-muted-foreground bg-background/80 backdrop-blur px-2 py-1 border border-border">
          {poses.length} frames
        </span>
      </div>

      {/* Legend */}
      <div className="absolute top-3 right-3 flex flex-col gap-1 text-[10px] bg-background/80 backdrop-blur px-2.5 py-2 border border-border">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-green-500" />
          <span className="text-muted-foreground">Start</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-red-500" />
          <span className="text-muted-foreground">End</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-cyan-400" />
          <span className="text-muted-foreground">Head</span>
        </div>
      </div>
    </div>
  );
}
