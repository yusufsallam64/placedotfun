import { useState } from 'react'

interface GridPosition {
  x: number
  y: number
}

interface MinimapProps {
  currentPosition: GridPosition
  discoveredPositions: Set<string>
  onNavigate: (position: GridPosition) => void
}

export default function Minimap({ currentPosition, discoveredPositions, onNavigate }: MinimapProps) {
  const [isCollapsed, setIsCollapsed] = useState(false)

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
