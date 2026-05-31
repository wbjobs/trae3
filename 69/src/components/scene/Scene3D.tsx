import { useMemo } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Grid, Stars, ContactShadows, Html } from '@react-three/drei';
import { useEquipmentStore } from '@/store/useEquipmentStore';
import { Equipment } from './Equipment';
import { MaintenancePoint } from '@/types';
import { Plane, Vector3 } from 'three';

function ClippingRoot({ children }: { children: React.ReactNode }) {
  const { clippingEnabled, clippingDirection, clippingPosition } = useEquipmentStore();

  const clippingPlanes = useMemo(() => {
    if (!clippingEnabled) return [];
    const normal = new Vector3(...clippingDirection).normalize();
    const plane = new Plane(normal, -clippingPosition);
    return [plane];
  }, [clippingEnabled, clippingDirection, clippingPosition]);

  return (
    <group clippingPlanes={clippingPlanes}>
      {children}
    </group>
  );
}

function MaintenanceMarkers() {
  const { maintenancePoints, selectedEquipment } = useEquipmentStore();
  const visiblePoints = selectedEquipment
    ? maintenancePoints.filter((p) => p.equipmentId === selectedEquipment.id)
    : maintenancePoints;

  return (
    <>
      {visiblePoints.map((point) => (
        <MaintenanceMarker key={point.id} point={point} />
      ))}
    </>
  );
}

function MaintenanceMarker({ point }: { point: MaintenancePoint }) {
  const typeColors: Record<string, string> = {
    inspection: '#3B82F6',
    repair: '#F59E0B',
    replacement: '#EF4444',
    calibration: '#8B5CF6',
  };

  const prioritySizes: Record<string, number> = {
    low: 0.08,
    medium: 0.1,
    high: 0.14,
  };

  const color = typeColors[point.type] || '#06B6D4';
  const size = prioritySizes[point.priority] || 0.1;

  return (
    <group position={[point.position.x, point.position.y, point.position.z]}>
      <mesh>
        <sphereGeometry args={[size, 8, 8]} />
        <meshBasicMaterial color={color} transparent opacity={0.8} />
      </mesh>
      <mesh>
        <ringGeometry args={[size * 1.5, size * 2, 12]} />
        <meshBasicMaterial color={color} transparent opacity={0.3} side={2} />
      </mesh>
      <Html position={[0, size * 4, 0]} center>
        <div className="bg-slate-900/90 backdrop-blur-sm px-2 py-1 rounded border border-cyan-500/30 shadow-lg whitespace-nowrap pointer-events-none">
          <div className="text-xs font-medium" style={{ color }}>{point.label}</div>
          <div className="text-[10px] text-slate-400">{point.type}</div>
        </div>
      </Html>
    </group>
  );
}

function SceneContent() {
  const { equipments, selectEquipment, clippingEnabled } = useEquipmentStore();

  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight
        position={[10, 10, 5]}
        intensity={1}
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <pointLight position={[-5, 5, -5]} intensity={0.5} color="#06B6D4" />
      <pointLight position={[5, 3, 5]} intensity={0.3} color="#0EA5E9" />

      <Stars radius={100} depth={50} count={2000} factor={4} saturation={0} fade speed={1} />

      <Grid
        position={[0, -0.01, 0]}
        args={[20, 20]}
        cellSize={1}
        cellThickness={0.5}
        cellColor="#1E3A5F"
        sectionSize={5}
        sectionThickness={1}
        sectionColor="#06B6D4"
        fadeDistance={30}
        fadeStrength={1}
        followCamera={false}
        infiniteGrid
      />

      <ContactShadows
        position={[0, 0, 0]}
        opacity={0.4}
        scale={20}
        blur={2}
        far={4}
      />

      <mesh
        position={[0, -0.5, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        onClick={() => selectEquipment(null)}
      >
        <planeGeometry args={[50, 50]} />
        <meshStandardMaterial color="#0F172A" metalness={0.8} roughness={0.4} />
      </mesh>

      <ClippingRoot>
        {equipments.map((equipment) => (
          <Equipment key={equipment.id} equipment={equipment} />
        ))}
      </ClippingRoot>

      {clippingEnabled && (
        <mesh position={[0, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <planeGeometry args={[30, 30]} />
          <meshBasicMaterial color="#0ea5e9" transparent opacity={0.05} side={2} />
        </mesh>
      )}

      <MaintenanceMarkers />

      <OrbitControls
        makeDefault
        minPolarAngle={0.1}
        maxPolarAngle={Math.PI / 2 - 0.1}
        minDistance={3}
        maxDistance={30}
        enableDamping
        dampingFactor={0.05}
      />
    </>
  );
}

export function Scene3D() {
  return (
    <Canvas
      shadows
      camera={{ position: [10, 8, 10], fov: 50 }}
      gl={{ antialias: true, alpha: false, localClippingEnabled: true }}
      style={{ background: '#0F172A' }}
    >
      <fog attach="fog" args={['#0F172A', 15, 40]} />
      <SceneContent />
    </Canvas>
  );
}
