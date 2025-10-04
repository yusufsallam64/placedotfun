import { useState } from 'react'
import Scene3D from './Scene3D'

interface GridPosition {
  x: number
  y: number
}

interface WorldGrid {
  [key: string]: string // key format: "x,y" -> modelPath
}

export default function WorldExplorer() {
  const [currentPosition, setCurrentPosition] = useState<GridPosition>({ x: 0, y: 0 })
  const [worldGrid, setWorldGrid] = useState<WorldGrid>({
    '0,0': '/scene-0-0.glb', // Initial position with the first model
    '0,1': '/scene-0-1.glb', // Second position with the second model
  })
  const [isLoading, setIsLoading] = useState(false)

  const getPositionKey = (pos: GridPosition): string => `${pos.x},${pos.y}`

  const getCurrentModel = (): string | null => {
    const key = getPositionKey(currentPosition)
    return worldGrid[key] || null
  }

  const moveToPosition = (newPosition: GridPosition) => {
    setIsLoading(true)
    setCurrentPosition(newPosition)

    // Simulate loading time
    setTimeout(() => setIsLoading(false), 300)
  }

  const move = (direction: 'north' | 'south' | 'east' | 'west') => {
    const newPos = { ...currentPosition }

    switch (direction) {
      case 'north':
        newPos.y += 1
        break
      case 'south':
        newPos.y -= 1
        break
      case 'east':
        newPos.x += 1
        break
      case 'west':
        newPos.x -= 1
        break
    }

    moveToPosition(newPos)
  }

  const currentModel = getCurrentModel()

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
      {/* 3D Scene or Placeholder */}
      {currentModel ? (
        <Scene3D key={getPositionKey(currentPosition)} modelPath={currentModel} />
      ) : (
        <div
          style={{
            width: '100vw',
            height: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
            color: 'white',
            gap: '20px',
          }}
        >
          <div style={{ fontSize: '48px' }}>🌌</div>
          <div style={{ fontSize: '24px', fontWeight: 'bold' }}>Uncharted Territory</div>
          <div style={{ fontSize: '16px', color: '#aaa', textAlign: 'center', maxWidth: '400px' }}>
            This location hasn't been generated yet. Soon, a new 3D space will be created here!
          </div>
          <div
            style={{
              fontSize: '14px',
              color: '#666',
              fontFamily: 'monospace',
              marginTop: '20px',
            }}
          >
            Position: ({currentPosition.x}, {currentPosition.y})
          </div>
        </div>
      )}

      {/* Loading Overlay */}
      {isLoading && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            background: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontSize: '24px',
            zIndex: 1000,
          }}
        >
          Loading...
        </div>
      )}

      {/* Navigation UI */}
      <div
        style={{
          position: 'absolute',
          bottom: '40px',
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '10px',
          zIndex: 100,
        }}
      >
        {/* North Button */}
        <button
          onClick={() => move('north')}
          disabled={isLoading}
          style={{
            padding: '12px 24px',
            fontSize: '16px',
            cursor: isLoading ? 'not-allowed' : 'pointer',
            background: '#4CAF50',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontWeight: 'bold',
            opacity: isLoading ? 0.5 : 1,
          }}
        >
          ↑ North
        </button>

        {/* East and West Buttons */}
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => move('west')}
            disabled={isLoading}
            style={{
              padding: '12px 24px',
              fontSize: '16px',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              background: '#4CAF50',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 'bold',
              opacity: isLoading ? 0.5 : 1,
            }}
          >
            ← West
          </button>

          <button
            onClick={() => move('east')}
            disabled={isLoading}
            style={{
              padding: '12px 24px',
              fontSize: '16px',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              background: '#4CAF50',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 'bold',
              opacity: isLoading ? 0.5 : 1,
            }}
          >
            East →
          </button>
        </div>

        {/* South Button */}
        <button
          onClick={() => move('south')}
          disabled={isLoading}
          style={{
            padding: '12px 24px',
            fontSize: '16px',
            cursor: isLoading ? 'not-allowed' : 'pointer',
            background: '#4CAF50',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontWeight: 'bold',
            opacity: isLoading ? 0.5 : 1,
          }}
        >
          ↓ South
        </button>
      </div>

      {/* Position Display - only show when in a 3D scene */}
      {currentModel && (
        <div
          style={{
            position: 'absolute',
            top: '20px',
            left: '20px',
            background: 'rgba(0, 0, 0, 0.7)',
            color: 'white',
            padding: '12px 20px',
            borderRadius: '8px',
            fontSize: '16px',
            fontFamily: 'monospace',
            zIndex: 100,
          }}
        >
          Position: ({currentPosition.x}, {currentPosition.y})
        </div>
      )}
    </div>
  )
}
