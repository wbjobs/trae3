const generateStratumPoints = (order, baseDepth, thickness, amplitude = 5) => {
  const points = [];
  const gridSize = 10;
  const spacing = 20;
  const offsetX = -((gridSize - 1) * spacing) / 2;
  const offsetY = -((gridSize - 1) * spacing) / 2;

  for (let i = 0; i < gridSize; i++) {
    for (let j = 0; j < gridSize; j++) {
      const x = offsetX + i * spacing;
      const y = offsetY + j * spacing;
      const noise = Math.sin(i * 0.3) * Math.cos(j * 0.3) * amplitude;
      const z = -(baseDepth + noise + order * thickness * 0.1);
      points.push({ x, y, z });
    }
  }
  return points;
};

const strataData = [
  {
    _id: '1',
    name: '表土层',
    code: 'Q',
    color: '#DEB887',
    description: '第四纪松散堆积层，主要为粉质黏土',
    thickness: 15,
    depth: 15,
    order: 1,
    points: generateStratumPoints(1, 0, 15, 3),
    annotations: [],
  },
  {
    _id: '2',
    name: '黏土层',
    code: 'N2',
    color: '#8B4513',
    description: '上新统黏土层，半固结状态',
    thickness: 25,
    depth: 40,
    order: 2,
    points: generateStratumPoints(2, 15, 25, 5),
    annotations: [],
  },
  {
    _id: '3',
    name: '砂岩层',
    code: 'E1',
    color: '#CD853F',
    description: '古近系砂岩，中等风化',
    thickness: 35,
    depth: 75,
    order: 3,
    points: generateStratumPoints(3, 40, 35, 7),
    annotations: [],
  },
  {
    _id: '4',
    name: '砾岩层',
    code: 'K2',
    color: '#A0522D',
    description: '白垩系砾岩，胶结良好',
    thickness: 45,
    depth: 120,
    order: 4,
    points: generateStratumPoints(4, 75, 45, 6),
    annotations: [],
  },
  {
    _id: '5',
    name: '灰岩层',
    code: 'T1',
    color: '#696969',
    description: '三叠系灰岩，岩溶发育',
    thickness: 60,
    depth: 180,
    order: 5,
    points: generateStratumPoints(5, 120, 60, 8),
    annotations: [],
  },
  {
    _id: '6',
    name: '花岗岩层',
    code: 'Pz',
    color: '#4A4A4A',
    description: '古生代花岗岩，致密坚硬',
    thickness: 100,
    depth: 280,
    order: 6,
    points: generateStratumPoints(6, 180, 100, 4),
    annotations: [],
  },
];

const drillHolesData = [];
const holePositions = [
  { x: -80, y: -80 }, { x: 0, y: -80 }, { x: 80, y: -80 },
  { x: -80, y: 0 }, { x: 0, y: 0 }, { x: 80, y: 0 },
  { x: -80, y: 80 }, { x: 0, y: 80 }, { x: 80, y: 80 },
];

const stratification = [
  { code: 'Q', name: '表土层', from: 0, to: 15 },
  { code: 'N2', name: '黏土层', from: 15, to: 40 },
  { code: 'E1', name: '砂岩层', from: 40, to: 75 },
  { code: 'K2', name: '砾岩层', from: 75, to: 120 },
  { code: 'T1', name: '灰岩层', from: 120, to: 180 },
  { code: 'Pz', name: '花岗岩层', from: 180, to: 280 },
];

holePositions.forEach((pos, idx) => {
  const samples = stratification.map(s => ({
    depthFrom: s.from + (Math.random() - 0.5) * 3,
    depthTo: s.to + (Math.random() - 0.5) * 3,
    stratumCode: s.code,
    stratumName: s.name,
    description: `${s.name}试样`,
  }));
  drillHolesData.push({
    _id: `hole_${idx + 1}`,
    holeId: `ZK${String(idx + 1).padStart(3, '0')}`,
    location: pos,
    depth: 280,
    samples,
  });
});

const getMockStrata = () => strataData;
const getMockDrillHoles = () => drillHolesData;

module.exports = { getMockStrata, getMockDrillHoles };
