import { useState, useEffect, useRef } from 'react'
import Scene3D from './Scene3D'
import Minimap from './Minimap'
import * as THREE from 'three'

interface GridPosition {
  x: number
  y: number
}

interface SceneData {
  modelPath: string
  rotation?: [number, number, number]
}

interface WorldGrid {
  [key: string]: SceneData // key format: "x,y" -> SceneData
}

const MOVE_SPEED = 0.05 // Configurable movement speed
const MAX_DISTANCE = 2.5 // Configurable boundary distance

export default function WorldExplorer() {
  const [currentPosition, setCurrentPosition] = useState<GridPosition>({ x: 0, y: 0 })
  const [discoveredPositions, setDiscoveredPositions] = useState<Set<string>>(new Set(['0,0']))
  const [worldGrid, setWorldGrid] = useState<WorldGrid>({
    '0,0': {
      modelPath: '/scene-0-0.glb',
      rotation: [Math.PI/2, 0, 0] // Flip upside down to right-side up
    },
    '0,1': {
      modelPath: '/scene-0-1.glb',
      rotation: [Math.PI/2, 0, 0] // Flip upside down to right-side up
    },
    '-1,0': {
      modelPath: '/scene--1-0.glb',
      rotation: [Math.PI/2, 0, 0] // Flip upside down to right-side up
    },
  })
  const [isLoading, setIsLoading] = useState(false)
  const cameraRotationRef = useRef<THREE.Euler | null>(null)
  const boundaryReachedRef = useRef(false)
  const boundaryTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const getPositionKey = (pos: GridPosition): string => `${pos.x},${pos.y}`

  const getCurrentSceneData = (): SceneData | null => {
    const key = getPositionKey(currentPosition)
    return worldGrid[key] || null
  }

  // Mark current position as discovered whenever it changes
  useEffect(() => {
    const key = getPositionKey(currentPosition)
    setDiscoveredPositions((prev) => new Set(prev).add(key))
  }, [currentPosition])

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

  const handleBoundaryReached = (direction: 'north' | 'south' | 'east' | 'west') => {
    // Debounce to prevent rapid transitions
    if (boundaryReachedRef.current) return

    boundaryReachedRef.current = true

    if (boundaryTimeoutRef.current) {
      clearTimeout(boundaryTimeoutRef.current)
    }

    boundaryTimeoutRef.current = setTimeout(() => {
      boundaryReachedRef.current = false
    }, 1000)

    // Transition to the next grid cell
    move(direction)
  }

  const handleCameraRotationChange = (euler: THREE.Euler) => {
    cameraRotationRef.current = euler
  }

  const currentSceneData = getCurrentSceneData()

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
      {/* Minimap */}
      <Minimap
        currentPosition={currentPosition}
        discoveredPositions={discoveredPositions}
        onNavigate={moveToPosition}
      />

      {/* 3D Scene or Placeholder */}
      {currentSceneData ? (
        <Scene3D
          key={getPositionKey(currentPosition)}
          modelPath={currentSceneData.modelPath}
          rotation={currentSceneData.rotation}
          moveSpeed={MOVE_SPEED}
          maxDistance={MAX_DISTANCE}
          onBoundaryReached={handleBoundaryReached}
          initialCameraRotation={cameraRotationRef.current ? { euler: cameraRotationRef.current } : undefined}
          onCameraRotationChange={handleCameraRotationChange}
        />
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

      {/* Controls Tooltip */}
      <div
        style={{
          position: 'absolute',
          bottom: '20px',
          right: '20px',
          background: 'rgba(0, 0, 0, 0.8)',
          color: 'white',
          padding: '12px 16px',
          borderRadius: '8px',
          fontSize: '13px',
          lineHeight: '1.6',
          zIndex: 100,
          fontFamily: 'monospace',
        }}
      >
        <div style={{ fontWeight: 'bold', marginBottom: '8px', fontSize: '14px' }}>Controls</div>
        <div>• Click to look around</div>
        <div>• WASD to move</div>
        <div>• Space to jump</div>
        <div>• Scroll to zoom</div>
        <div>• ESC to unlock cursor</div>
      </div>

    </div>
  )
}
