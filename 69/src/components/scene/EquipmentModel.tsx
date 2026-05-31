import { useRef, useMemo } from 'react';
import { Group, MeshStandardMaterial, Color, DoubleSide } from 'three';
import { useFrame } from '@react-three/fiber';
import { EquipmentStatus } from '@/types';

interface EquipmentModelProps {
  status: EquipmentStatus;
  isSelected: boolean;
  isHovered: boolean;
  onClick: () => void;
  onPointerOver: () => void;
  onPointerOut: () => void;
}

const STATUS_COLORS: Record<EquipmentStatus, string> = {
  normal: '#10B981',
  warning: '#F59E0B',
  alarm: '#EF4444',
};

function useSharedMaterials(status: EquipmentStatus, isSelected: boolean, isHovered: boolean) {
  const color = STATUS_COLORS[status];
  const emissiveIntensity = isSelected ? 0.5 : isHovered ? 0.3 : 0.1;

  return useMemo(() => ({
    body: new MeshStandardMaterial({ color: '#374151', metalness: 0.8, roughness: 0.2 }),
    cap: new MeshStandardMaterial({ color: '#4B5563', metalness: 0.7, roughness: 0.3 }),
    pipe: new MeshStandardMaterial({ color: '#6B7280', metalness: 0.6, roughness: 0.4 }),
    status: new MeshStandardMaterial({ color, emissive: color, emissiveIntensity, metalness: 0.5, roughness: 0.5 }),
    statusLow: new MeshStandardMaterial({ color, emissive: color, emissiveIntensity: emissiveIntensity * 0.3, transparent: true, opacity: 0.2 }),
    select: new MeshStandardMaterial({ color: '#06B6D4', transparent: true, opacity: 0.8 }),
    section: new MeshStandardMaterial({ color: '#1E293B', metalness: 0.6, roughness: 0.4, side: DoubleSide }),
    inner: new MeshStandardMaterial({ color: '#F59E0B', metalness: 0.3, roughness: 0.6 }),
    innerAccent: new MeshStandardMaterial({ color: '#EF4444', metalness: 0.3, roughness: 0.6 }),
  }), [color, emissiveIntensity]);
}

export function PumpModel({ status, isSelected, isHovered, onClick, onPointerOver, onPointerOut }: EquipmentModelProps) {
  const groupRef = useRef<Group>(null);
  const mat = useSharedMaterials(status, isSelected, isHovered);

  useFrame(() => {
    if (groupRef.current && status !== 'alarm') {
      groupRef.current.children[2].rotation.y += 0.02;
    }
  });

  return (
    <group ref={groupRef} onClick={onClick} onPointerOver={onPointerOver} onPointerOut={onPointerOut}>
      <mesh position={[0, 0.3, 0]} castShadow material={mat.body}>
        <cylinderGeometry args={[0.4, 0.5, 0.6, 12]} />
      </mesh>
      <mesh position={[0, 0.8, 0]} castShadow material={mat.cap}>
        <cylinderGeometry args={[0.35, 0.35, 0.4, 12]} />
      </mesh>
      <mesh position={[0, 1.1, 0]} material={mat.status}>
        <torusGeometry args={[0.2, 0.05, 8, 12]} />
      </mesh>
      <mesh position={[0.6, 0.5, 0]} rotation={[0, 0, Math.PI / 2]} material={mat.pipe}>
        <cylinderGeometry args={[0.1, 0.15, 0.3, 8]} />
      </mesh>
      <mesh position={[-0.6, 0.5, 0]} rotation={[0, 0, Math.PI / 2]} material={mat.pipe}>
        <cylinderGeometry args={[0.1, 0.15, 0.3, 8]} />
      </mesh>

      {isSelected && (
        <mesh position={[0, 0.8, 0]} material={mat.select}>
          <ringGeometry args={[0.6, 0.7, 12]} />
        </mesh>
      )}

      {isHovered && (
        <group>
          <mesh position={[0, 0.15, 0]} material={mat.section}>
            <cylinderGeometry args={[0.48, 0.48, 0.02, 12]} />
          </mesh>
          <mesh position={[0, 0.55, 0]} material={mat.inner}>
            <cylinderGeometry args={[0.15, 0.2, 0.4, 8]} />
          </mesh>
        </group>
      )}
    </group>
  );
}

export function MotorModel({ status, isSelected, isHovered, onClick, onPointerOver, onPointerOut }: EquipmentModelProps) {
  const groupRef = useRef<Group>(null);
  const mat = useSharedMaterials(status, isSelected, isHovered);

  useFrame(() => {
    if (groupRef.current && status !== 'alarm') {
      groupRef.current.children[3].rotation.x += 0.05;
    }
  });

  return (
    <group ref={groupRef} onClick={onClick} onPointerOver={onPointerOver} onPointerOut={onPointerOut}>
      <mesh position={[0, 0.5, 0]} castShadow material={mat.body}>
        <boxGeometry args={[0.8, 0.6, 1.2]} />
      </mesh>
      <mesh position={[0, 0.9, 0]} material={mat.cap}>
        <boxGeometry args={[0.6, 0.2, 1.0]} />
      </mesh>
      <mesh position={[0, 0.5, 0.7]} material={mat.pipe}>
        <cylinderGeometry args={[0.15, 0.15, 0.4, 8]} />
      </mesh>
      <mesh position={[0, 0.5, -0.7]} rotation={[Math.PI / 2, 0, 0]} material={mat.status}>
        <torusGeometry args={[0.25, 0.03, 6, 12]} />
      </mesh>

      {isSelected && (
        <mesh position={[0, 0.5, 0]} material={mat.select}>
          <ringGeometry args={[0.8, 0.9, 12]} />
        </mesh>
      )}

      {isHovered && (
        <group>
          <mesh position={[0, 0.5, 0]} material={mat.section}>
            <boxGeometry args={[0.82, 0.02, 1.22]} />
          </mesh>
          <mesh position={[0, 0.3, 0]} material={mat.inner}>
            <cylinderGeometry args={[0.2, 0.2, 0.8, 8]} rotation={[0, 0, Math.PI / 2]} />
          </mesh>
          <mesh position={[0.15, 0.3, 0]} material={mat.innerAccent}>
            <boxGeometry args={[0.15, 0.3, 0.5]} />
          </mesh>
        </group>
      )}
    </group>
  );
}

export function TurbineModel({ status, isSelected, isHovered, onClick, onPointerOver, onPointerOut }: EquipmentModelProps) {
  const groupRef = useRef<Group>(null);
  const mat = useSharedMaterials(status, isSelected, isHovered);

  useFrame(() => {
    if (groupRef.current && status !== 'alarm') {
      groupRef.current.children[1].rotation.z += 0.01;
    }
  });

  return (
    <group ref={groupRef} onClick={onClick} onPointerOver={onPointerOver} onPointerOut={onPointerOut}>
      <mesh position={[0, 0.8, 0]} castShadow material={mat.body}>
        <cylinderGeometry args={[0.3, 0.5, 1.6, 12]} />
      </mesh>
      <group position={[0, 1.6, 0]}>
        {[0, 1, 2].map((i) => (
          <mesh key={i} rotation={[0, 0, (i * Math.PI * 2) / 3]} material={mat.statusLow}>
            <boxGeometry args={[0.05, 0.8, 0.3]} />
          </mesh>
        ))}
      </group>
      <mesh position={[0, 2.1, 0]} material={mat.status}>
        <sphereGeometry args={[0.15, 8, 8]} />
      </mesh>

      {isSelected && (
        <mesh position={[0, 0.8, 0]} material={mat.select}>
          <ringGeometry args={[0.7, 0.8, 12]} />
        </mesh>
      )}

      {isHovered && (
        <group>
          <mesh position={[0, 0.8, 0]} material={mat.section}>
            <cylinderGeometry args={[0.51, 0.51, 0.02, 12]} />
          </mesh>
          <mesh position={[0, 1.2, 0]} material={mat.inner}>
            <cylinderGeometry args={[0.12, 0.12, 0.6, 6]} />
          </mesh>
          <mesh position={[0, 1.2, 0]} material={mat.innerAccent}>
            <torusGeometry args={[0.18, 0.03, 6, 8]} />
          </mesh>
        </group>
      )}
    </group>
  );
}

export function ValveModel({ status, isSelected, isHovered, onClick, onPointerOver, onPointerOut }: EquipmentModelProps) {
  const mat = useSharedMaterials(status, isSelected, isHovered);

  return (
    <group onClick={onClick} onPointerOver={onPointerOver} onPointerOut={onPointerOut}>
      <mesh position={[0, 0.4, 0]} material={mat.cap}>
        <cylinderGeometry args={[0.2, 0.2, 0.8, 8]} />
      </mesh>
      <mesh position={[0, 0.9, 0]} material={mat.status}>
        <boxGeometry args={[0.5, 0.15, 0.15]} />
      </mesh>
      <mesh position={[0, 0.4, 0.35]} material={mat.pipe}>
        <cylinderGeometry args={[0.12, 0.12, 0.3, 8]} />
      </mesh>
      <mesh position={[0, 0.4, -0.35]} material={mat.pipe}>
        <cylinderGeometry args={[0.12, 0.12, 0.3, 8]} />
      </mesh>

      {isSelected && (
        <mesh position={[0, 0.4, 0]} material={mat.select}>
          <ringGeometry args={[0.4, 0.5, 12]} />
        </mesh>
      )}

      {isHovered && (
        <group>
          <mesh position={[0, 0.4, 0]} material={mat.section}>
            <cylinderGeometry args={[0.22, 0.22, 0.02, 8]} />
          </mesh>
          <mesh position={[0, 0.4, 0]} material={mat.inner}>
            <cylinderGeometry args={[0.08, 0.08, 0.3, 6]} />
          </mesh>
        </group>
      )}
    </group>
  );
}

export function TankModel({ status, isSelected, isHovered, onClick, onPointerOver, onPointerOut }: EquipmentModelProps) {
  const mat = useSharedMaterials(status, isSelected, isHovered);

  return (
    <group onClick={onClick} onPointerOver={onPointerOver} onPointerOut={onPointerOut}>
      <mesh position={[0, 0.8, 0]} castShadow material={mat.body}>
        <cylinderGeometry args={[0.6, 0.6, 1.6, 12]} />
      </mesh>
      <mesh position={[0, 1.6, 0]} material={mat.cap}>
        <cylinderGeometry args={[0.6, 0.65, 0.1, 12]} />
      </mesh>
      <mesh position={[0, 0, 0]} material={mat.cap}>
        <cylinderGeometry args={[0.6, 0.65, 0.1, 12]} />
      </mesh>
      <mesh position={[0.5, 1.0, 0]} material={mat.pipe}>
        <cylinderGeometry args={[0.08, 0.08, 0.4, 6]} rotation={[0, 0, Math.PI / 2]} />
      </mesh>
      <mesh position={[0, 0.8, 0]} material={mat.statusLow}>
        <cylinderGeometry args={[0.55, 0.55, 1.5, 12]} />
      </mesh>

      {isSelected && (
        <mesh position={[0, 0.8, 0]} material={mat.select}>
          <ringGeometry args={[0.8, 0.9, 12]} />
        </mesh>
      )}

      {isHovered && (
        <group>
          <mesh position={[0, 0.8, 0]} material={mat.section}>
            <cylinderGeometry args={[0.62, 0.62, 0.02, 12]} />
          </mesh>
          <mesh position={[0, 0.6, 0]} material={mat.inner}>
            <cylinderGeometry args={[0.45, 0.45, 0.8, 8]} />
          </mesh>
        </group>
      )}
    </group>
  );
}
