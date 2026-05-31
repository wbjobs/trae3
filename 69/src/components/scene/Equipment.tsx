import { useState, memo, useCallback } from 'react';
import { Equipment as EquipmentType } from '@/types';
import { useEquipmentStore } from '@/store/useEquipmentStore';
import { PumpModel, MotorModel, TurbineModel, ValveModel, TankModel } from './EquipmentModel';
import { Html } from '@react-three/drei';

interface EquipmentProps {
  equipment: EquipmentType;
}

const equipmentModels: Record<string, React.FC<any>> = {
  pump: PumpModel,
  motor: MotorModel,
  turbine: TurbineModel,
  compressor: MotorModel,
  valve: ValveModel,
  sensor: ValveModel,
};

function EquipmentComponent({ equipment }: EquipmentProps) {
  const [isHovered, setIsHovered] = useState(false);
  const { selectedEquipment, selectEquipment } = useEquipmentStore();
  const isSelected = selectedEquipment?.id === equipment.id;

  const ModelComponent = equipmentModels[equipment.type] || MotorModel;

  const handleClick = useCallback((e: any) => {
    e.stopPropagation();
    selectEquipment(isSelected ? null : equipment);
  }, [isSelected, equipment, selectEquipment]);

  const handlePointerOver = useCallback((e: any) => {
    e.stopPropagation();
    setIsHovered(true);
    document.body.style.cursor = 'pointer';
  }, []);

  const handlePointerOut = useCallback(() => {
    setIsHovered(false);
    document.body.style.cursor = 'auto';
  }, []);

  return (
    <group position={[equipment.position.x, equipment.position.y, equipment.position.z]}>
      <ModelComponent
        status={equipment.status}
        isSelected={isSelected}
        isHovered={isHovered}
        onClick={handleClick}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
      />

      {isHovered && (
        <Html position={[0, 2.5, 0]} center>
          <div className="bg-slate-800/90 backdrop-blur-sm px-3 py-2 rounded-lg border border-cyan-500/30 shadow-lg shadow-cyan-500/20 whitespace-nowrap">
            <div className="text-cyan-400 font-medium text-sm">{equipment.name}</div>
            <div className="text-slate-400 text-xs mt-0.5">{equipment.type}</div>
          </div>
        </Html>
      )}
    </group>
  );
}

const equipmentPropsAreEqual = (prev: EquipmentProps, next: EquipmentProps): boolean => {
  if (prev.equipment.id !== next.equipment.id) return false;
  if (prev.equipment.status !== next.equipment.status) return false;

  const prevParams = prev.equipment.parameters;
  const nextParams = next.equipment.parameters;
  if (prevParams.length !== nextParams.length) return false;

  for (let i = 0; i < prevParams.length; i++) {
    if (Math.abs(prevParams[i].value - nextParams[i].value) > 0.1) return false;
    if (prevParams[i].status !== nextParams[i].status) return false;
  }

  return true;
};

export const Equipment = memo(EquipmentComponent, equipmentPropsAreEqual);
