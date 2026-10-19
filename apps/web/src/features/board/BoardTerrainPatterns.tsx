import terrainAtlas from '../../assets/terrain-atlas.webp'
import type { Terrain } from './boardApi'

// The approved atlas has three columns and two rows, without gutters.
const TERRAIN_ATLAS_CELLS: Record<Terrain, [number, number]> = {
  forest: [0, 0],
  pasture: [100, 0],
  fields: [200, 0],
  hills: [0, 100],
  mountains: [100, 100],
  desert: [200, 100],
}

export function BoardTerrainPatterns({ idPrefix }: { idPrefix: string }) {
  return Object.entries(TERRAIN_ATLAS_CELLS).map(([terrain, [x, y]]) => (
    <pattern
      id={`${idPrefix}-${terrain}`}
      key={terrain}
      width="1"
      height="1"
      patternContentUnits="objectBoundingBox"
    >
      <rect width="1" height="1" fill={`var(--board-${terrain})`} />
      <svg
        width="1"
        height="1"
        viewBox={`${x} ${y} 100 100`}
        preserveAspectRatio="none"
        overflow="hidden"
      >
        <image href={terrainAtlas} width="300" height="200" />
      </svg>
    </pattern>
  ))
}
