"use client";

import { useRef, useState, useMemo, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Grid, Line, Text, Billboard } from "@react-three/drei";
import * as THREE from "three";
import { PoseFrame } from "@/lib/api";

interface Props {
  poses: PoseFrame[];
  playing?: boolean;
  currentFrame?: number;
  followCamera?: boolean;
}

function HumanFigure({ position, rotation, color }: {
  position: [number, number, number];
  rotation: [number, number, number];
  color: string;
}) {
  return (
    <group position={position} rotation={[0, rotation[2], 0]}>
      <mesh position={[0, 0.32, 0]}>
        <sphereGeometry args={[0.045, 16, 16]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.4} />
      </mesh>
      <mesh position={[0, 0.27, 0]}>
        <cylinderGeometry args={[0.015, 0.015, 0.04, 8]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.2} />
      </mesh>
      <mesh position={[0, 0.17, 0]}>
        <boxGeometry args={[0.1, 0.16, 0.05]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.2} />
      </mesh>
      <mesh position={[-0.07, 0.17, 0]} rotation={[0, 0, 0.15]}>
        <boxGeometry args={[0.025, 0.14, 0.025]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.15} />
      </mesh>
      <mesh position={[0.07, 0.17, 0]} rotation={[0, 0, -0.15]}>
        <boxGeometry args={[0.025, 0.14, 0.025]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.15} />
      </mesh>
      <mesh position={[-0.025, 0.0, 0]}>
        <boxGeometry args={[0.03, 0.18, 0.03]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.15} />
      </mesh>
      <mesh position={[0.025, 0.0, 0]}>
        <boxGeometry args={[0.03, 0.18, 0.03]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.15} />
      </mesh>
      <mesh position={[0, 0.32, -0.08]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.015, 0.05, 6]} />
        <meshStandardMaterial color="#22d3ee" emissive="#22d3ee" emissiveIntensity={0.8} />
      </mesh>
      <mesh position={[0, -0.09, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.04, 0.06, 24]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.6} transparent opacity={0.5} side={THREE.DoubleSide} />
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
      lineWidth={2.5}
    />
  );
}

function FollowCamera({ target, follow }: { target: THREE.Vector3; follow: boolean }) {
  const { camera } = useThree();
  const smoothTarget = useRef(new THREE.Vector3());
  const smoothCamPos = useRef(new THREE.Vector3(1.5, 1.2, 1.5));

  useFrame(() => {
    if (!follow) return;

    const desiredCamPos = new THREE.Vector3(
      target.x + 0.8,
      target.y + 0.6,
      target.z + 0.8,
    );

    smoothTarget.current.lerp(target, 0.05);
    smoothCamPos.current.lerp(desiredCamPos, 0.05);

    camera.position.copy(smoothCamPos.current);
    camera.lookAt(smoothTarget.current);
  });

  return null;
}

function AnimatedHuman({ poses, playing, currentFrame, onPositionChange }: {
  poses: PoseFrame[];
  playing: boolean;
  currentFrame?: number;
  onPositionChange?: (pos: THREE.Vector3) => void;
}) {
  const [frameIdx, setFrameIdx] = useState(0);
  const timeRef = useRef(0);

  useEffect(() => {
    if (currentFrame !== undefined) {
      setFrameIdx(currentFrame);
      timeRef.current = currentFrame;
    }
  }, [currentFrame]);

  useFrame((_, delta) => {
    if (currentFrame !== undefined) return;
    if (!playing || poses.length === 0) return;
    timeRef.current += delta * 30;
    const idx = Math.floor(timeRef.current) % poses.length;
    setFrameIdx(idx);
  });

  useEffect(() => {
    if (poses.length === 0) return;
    const idx = Math.min(frameIdx, poses.length - 1);
    const pose = poses[idx];
    onPositionChange?.(new THREE.Vector3(pose.pose.position.x, pose.pose.position.y, pose.pose.position.z));
  }, [frameIdx, poses, onPositionChange]);

  if (poses.length === 0) return null;

  const idx = Math.min(frameIdx, poses.length - 1);
  const pose = poses[idx];
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

  const trailStart = Math.max(0, idx - 40);
  const trailPoses = poses.slice(trailStart, idx + 1);
  const trailPoints = trailPoses.map(p =>
    new THREE.Vector3(p.pose.position.x, p.pose.position.y, p.pose.position.z)
  );

  return (
    <>
      <HumanFigure position={pos} rotation={rot} color="#a78bfa" />
      {trailPoints.length >= 2 && (
        <Line points={trailPoints} color="#a78bfa" lineWidth={3} transparent opacity={0.7} />
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

function Scene({ poses, playing, currentFrame, followCamera: followCam }: Props) {
  const [humanPos, setHumanPos] = useState(new THREE.Vector3());

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

  const floorY = useMemo(() => {
    if (poses.length === 0) return -0.1;
    return Math.min(...poses.map(p => p.pose.position.y)) - 0.1;
  }, [poses]);

  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 8, 5]} intensity={0.9} />
      <pointLight position={[-3, 3, -3]} intensity={0.3} color="#818cf8" />
      <pointLight position={[3, 1, 3]} intensity={0.2} color="#22d3ee" />

      <Grid
        args={[20, 20]}
        position={[center.x, floorY, center.z]}
        cellSize={0.5}
        cellColor="#2a2a2a"
        sectionSize={2}
        sectionColor="#444"
        fadeDistance={12}
        infiniteGrid
      />

      <axesHelper args={[1]} />
      <AxisLabels />

      <TrajectoryPath poses={poses} />
      <AnimatedHuman
        poses={poses}
        playing={playing ?? false}
        currentFrame={currentFrame}
        onPositionChange={setHumanPos}
      />

      <FollowCamera target={humanPos} follow={followCam ?? true} />

      {poses.length > 0 && (
        <group position={[poses[0].pose.position.x, poses[0].pose.position.y, poses[0].pose.position.z]}>
          <mesh position={[0, -0.05, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.03, 0.06, 24]} />
            <meshStandardMaterial color="#22c55e" emissive="#22c55e" emissiveIntensity={1} side={THREE.DoubleSide} />
          </mesh>
          <Billboard position={[0, 0.15, 0]}><Text fontSize={0.05} color="#22c55e">START</Text></Billboard>
        </group>
      )}

      {poses.length > 1 && (
        <group position={[
          poses[poses.length - 1].pose.position.x,
          poses[poses.length - 1].pose.position.y,
          poses[poses.length - 1].pose.position.z,
        ]}>
          <mesh position={[0, -0.05, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.03, 0.06, 24]} />
            <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={1} side={THREE.DoubleSide} />
          </mesh>
          <Billboard position={[0, 0.15, 0]}><Text fontSize={0.05} color="#ef4444">END</Text></Billboard>
        </group>
      )}
    </>
  );
}

export function TrajectoryViewer3D({ poses, playing = false, currentFrame, followCamera = true }: Props) {
  const [isPlaying, setIsPlaying] = useState(playing);

  return (
    <div className="relative w-full h-full" style={{ minHeight: 420 }}>
      <Canvas
        camera={{ position: [1.5, 1.2, 1.5], fov: 50, near: 0.01, far: 100 }}
        style={{ background: "#0a0a0a" }}
      >
        <Scene poses={poses} playing={isPlaying} currentFrame={currentFrame} followCamera={followCamera} />
      </Canvas>

      {currentFrame === undefined && (
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
      )}

      <div className="absolute top-3 right-3 flex flex-col gap-1 text-[10px] bg-black/70 backdrop-blur px-2.5 py-2 border border-white/10">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-green-500" />
          <span className="text-white/60">Start</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-red-500" />
          <span className="text-white/60">End</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-violet-400" />
          <span className="text-white/60">Person</span>
        </div>
      </div>
    </div>
  );
}
