import { useState, useEffect } from 'react'
import * as THREE from 'three'

interface GridPosition {
  x: number
  y: number
}

interface MinimapProps {
  currentPosition: GridPosition
  discoveredPositions: Set<string>
  onNavigate: (position: GridPosition) => void
  cameraRotation: THREE.Euler | null
}

export default function Minimap({ currentPosition, discoveredPositions, onNavigate, cameraRotation }: MinimapProps) {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [direction, setDirection] = useState<'North' | 'East' | 'South' | 'West'>('North')
  const [headingDegrees, setHeadingDegrees] = useState<number>(0)

  useEffect(() => {
    if (!cameraRotation) return

    // Calculate direction vector based on camera rotation
    const directionVec = new THREE.Vector3(0, 0, -1)
    directionVec.applyEuler(cameraRotation)

    // Based on Scene3D boundary detection:
    // 3D -Z direction → North (grid +Y)
    // 3D +Z direction → South (grid -Y)
    // 3D +X direction → East (grid +X)
    // 3D -X direction → West (grid -X)

    const x = directionVec.x
    const z = directionVec.z

    // Calculate angle from -Z axis (North)
    const angle = Math.atan2(x, -z)
    const degrees = (angle * 180 / Math.PI + 360) % 360

    // Determine cardinal direction
    let cardinal: 'North' | 'East' | 'South' | 'West'

    if (degrees >= 315 || degrees < 45) {
      cardinal = 'North'
    } else if (degrees >= 45 && degrees < 135) {
      cardinal = 'East'
    } else if (degrees >= 135 && degrees < 225) {
      cardinal = 'South'
    } else {
      cardinal = 'West'
    }

    setDirection(cardinal)
    setHeadingDegrees(degrees)
  }, [cameraRotation])

  // Calculate the bounds for a 5x5 grid centered on current position
  const getGridBounds = () => {
    const gridRadius = 2 // Shows 2 cells in each direction from center = 5x5 grid

    return {
      minX: currentPosition.x - gridRadius,
      maxX: currentPosition.x + gridRadius,
      minY: currentPosition.y - gridRadius,
      maxY: currentPosition.y + gridRadius,
    }
  }

  const bounds = getGridBounds()
  const cellSize = 30

  const renderGrid = () => {
    const cells = []
    for (let y = bounds.maxY; y >= bounds.minY; y--) {
      for (let x = bounds.minX; x <= bounds.maxX; x++) {
        const key = `${x},${y}`
        const isDiscovered = discoveredPositions.has(key)
        const isCurrent = x === currentPosition.x && y === currentPosition.y

        cells.push(
          <div
            key={key}
            onClick={() => isDiscovered && onNavigate({ x, y })}
            style={{
              width: `${cellSize}px`,
              height: `${cellSize}px`,
              border: '1px solid #444',
              background: isCurrent ? '#666' : isDiscovered ? 'white' : 'transparent',
              cursor: isDiscovered ? 'pointer' : 'default',
              transition: 'background 0.2s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '10px',
              color: isCurrent ? 'white' : '#333',
            }}
            onMouseEnter={(e) => {
              if (isDiscovered && !isCurrent) {
                e.currentTarget.style.background = '#e0e0e0'
              }
            }}
            onMouseLeave={(e) => {
              if (isDiscovered && !isCurrent) {
                e.currentTarget.style.background = 'white'
              }
            }}
          >
            {isCurrent && '●'}
          </div>
        )
      }
    }
    return cells
  }

  if (isCollapsed) {
    return (
      <div
        style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          background: 'rgba(0, 0, 0, 0.8)',
          padding: '10px 15px',
          borderRadius: '8px',
          color: 'white',
          cursor: 'pointer',
          zIndex: 1000,
          fontSize: '14px',
        }}
        onClick={() => setIsCollapsed(false)}
      >
        📍 Map
      </div>
    )
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: '20px',
        right: '20px',
        background: 'rgba(0, 0, 0, 0.9)',
        padding: '15px',
        borderRadius: '8px',
        zIndex: 1000,
        maxHeight: '400px',
        maxWidth: '300px',
        overflow: 'auto',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '10px',
          color: 'white',
        }}
      >
        <div style={{ fontSize: '14px', fontWeight: 'bold' }}>
          Position: ({currentPosition.x}, {currentPosition.y})
        </div>
        <button
          onClick={() => setIsCollapsed(true)}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'white',
            cursor: 'pointer',
            fontSize: '18px',
            padding: '0',
          }}
        >
          ✕
        </button>
      </div>

      {/* Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${bounds.maxX - bounds.minX + 1}, ${cellSize}px)`,
          gap: '0',
          background: '#222',
          padding: '5px',
          borderRadius: '4px',
        }}
      >
        {renderGrid()}
      </div>

      {/* Compass (visual) */}
      <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{ position: 'relative', width: '72px', height: '72px' }}>
          {/* Compass ring */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              border: '1px solid rgba(255,255,255,0.25)',
              boxShadow: 'inset 0 0 12px rgba(0,0,0,0.6)'
            }}
          />
          {/* Cardinal labels */}
          <div style={{ position: 'absolute', top: '-8px', left: '50%', transform: 'translateX(-50%)', fontSize: '9px', color: '#ddd' }}>N</div>
          <div style={{ position: 'absolute', bottom: '-8px', left: '50%', transform: 'translateX(-50%)', fontSize: '9px', color: '#aaa' }}>S</div>
          <div style={{ position: 'absolute', left: '-8px', top: '50%', transform: 'translateY(-50%)', fontSize: '9px', color: '#aaa' }}>W</div>
          <div style={{ position: 'absolute', right: '-8px', top: '50%', transform: 'translateY(-50%)', fontSize: '9px', color: '#aaa' }}>E</div>

          {/* Direction arrow */}
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              width: '2px',
              height: '26px',
              background: 'linear-gradient(180deg, #fca5a5, #ef4444)',
              transformOrigin: 'bottom center',
              transform: `translate(-50%, -100%) rotate(${headingDegrees}deg)`,
              borderRadius: '2px'
            }}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', marginLeft: '10px' }}>
          <div style={{ fontSize: '10px', color: '#aaa' }}>Facing</div>
          <div style={{ fontSize: '14px', fontWeight: 'bold', color: 'white' }}>{direction}</div>
        </div>
      </div>

      {/* Legend */}
      <div style={{ marginTop: '10px', fontSize: '11px', color: '#aaa' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
          <div
            style={{
              width: '15px',
              height: '15px',
              background: '#666',
              border: '1px solid #444',
            }}
          />
          <span>Current</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
          <div
            style={{
              width: '15px',
              height: '15px',
              background: 'white',
              border: '1px solid #444',
            }}
          />
          <span>Discovered</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: '15px',
              height: '15px',
              background: 'transparent',
              border: '1px solid #444',
            }}
          />
          <span>Unexplored</span>
        </div>
      </div>
    </div>
  )
}
