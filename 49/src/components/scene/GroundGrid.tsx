import { Grid } from '@react-three/drei'

export default function GroundGrid() {
  return (
    <Grid
      args={[60, 60]}
      position={[0, 0, 0]}
      cellSize={1}
      cellThickness={0.5}
      cellColor="#1a3a5c"
      sectionSize={5}
      sectionThickness={1}
      sectionColor="#2a5a8c"
      fadeDistance={80}
      fadeStrength={1.5}
      infiniteGrid={false}
    />
  )
}
