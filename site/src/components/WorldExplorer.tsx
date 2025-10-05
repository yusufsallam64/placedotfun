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
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationError, setGenerationError] = useState<string | null>(null)
  const [cameraRotation, setCameraRotation] = useState<THREE.Euler | null>(null)
  const [showPromptModal, setShowPromptModal] = useState(false)
  const [userPrompt, setUserPrompt] = useState('')
  const [pendingPosition, setPendingPosition] = useState<GridPosition | null>(null)
  const cameraRotationRef = useRef<THREE.Euler | null>(null)
  const boundaryReachedRef = useRef(false)
  const boundaryTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const generationQueueRef = useRef<Set<string>>(new Set())

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

  // Generate scene for unmapped positions
  const generateScene = async (position: GridPosition, customPrompt?: string) => {
    const key = getPositionKey(position)

    // Check if already in queue or already generated
    if (generationQueueRef.current.has(key) || worldGrid[key]) {
      return
    }

    // Add to queue
    generationQueueRef.current.add(key)
    setIsGenerating(true)
    setGenerationError(null)

    try {
      console.log(`[WorldExplorer] Generating scene for position (${position.x}, ${position.y})`)
      if (customPrompt) {
        console.log(`[WorldExplorer] With custom prompt: "${customPrompt}"`)
      }

      const response = await fetch('/api/generate-scene', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          x: position.x,
          y: position.y,
          userPrompt: customPrompt || undefined,
        }),
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to generate scene')
      }

      console.log(`[WorldExplorer] Scene generated successfully:`, data.filename)

      // Add to world grid with proper rotation
      setWorldGrid((prev) => ({
        ...prev,
        [key]: {
          modelPath: `/${data.filename}`,
          rotation: [Math.PI / 2, 0, 0], // Apply consistent rotation
        },
      }))

      setGenerationError(null)

    } catch (error) {
      console.error('[WorldExplorer] Scene generation failed:', error)
      setGenerationError(error instanceof Error ? error.message : 'Failed to generate scene')
    } finally {
      generationQueueRef.current.delete(key)
      setIsGenerating(false)
    }
  }

  // Trigger prompt modal when entering an unmapped position
  useEffect(() => {
    const key = getPositionKey(currentPosition)
    if (!worldGrid[key] && !generationQueueRef.current.has(key)) {
      // Show prompt modal to let user customize the scene
      setPendingPosition(currentPosition)
      setShowPromptModal(true)
    }
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

    // Block transition to unmapped positions during generation
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

    const newKey = getPositionKey(newPos)
    const isNewPositionMapped = Boolean(worldGrid[newKey])

    // Block if trying to move to another unmapped position while generating
    if (!isNewPositionMapped && isGenerating) {
      console.log('[WorldExplorer] Blocked transition to unmapped position during generation')
      return
    }

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
    setCameraRotation(euler.clone())
  }

  const handlePromptSubmit = () => {
    if (pendingPosition) {
      setShowPromptModal(false)
      generateScene(pendingPosition, userPrompt.trim() || undefined)
      setPendingPosition(null)
      setUserPrompt('')
    }
  }

  const handlePromptCancel = () => {
    setShowPromptModal(false)
    if (pendingPosition) {
      // Generate with no custom prompt
      generateScene(pendingPosition)
      setPendingPosition(null)
    }
    setUserPrompt('')
  }

  const currentSceneData = getCurrentSceneData()

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
      {/* Minimap with Compass */}
      <Minimap
        currentPosition={currentPosition}
        discoveredPositions={discoveredPositions}
        onNavigate={moveToPosition}
        cameraRotation={cameraRotation}
      />

      {/* Prompt Modal */}
      {showPromptModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
            backdropFilter: 'blur(8px)',
          }}
        >
          <div
            style={{
              background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
              padding: '40px',
              borderRadius: '16px',
              maxWidth: '600px',
              width: '90%',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
            }}
          >
            <h2
              style={{
                margin: '0 0 12px 0',
                fontSize: '28px',
                fontWeight: 'bold',
                color: 'white',
              }}
            >
              Create Your Space ✨
            </h2>
            <p
              style={{
                margin: '0 0 24px 0',
                fontSize: '16px',
                color: '#aaa',
                lineHeight: '1.6',
              }}
            >
              Describe the room you'd like to generate. Be creative! Your description will influence the 3D environment that gets created.
            </p>
            <textarea
              value={userPrompt}
              onChange={(e) => setUserPrompt(e.target.value)}
              placeholder="e.g., a cozy library with warm lighting and bookshelves, a futuristic space station, a serene Japanese garden..."
              style={{
                width: '100%',
                minHeight: '120px',
                padding: '16px',
                fontSize: '16px',
                borderRadius: '8px',
                border: '2px solid rgba(255, 255, 255, 0.2)',
                background: 'rgba(0, 0, 0, 0.3)',
                color: 'white',
                resize: 'vertical',
                fontFamily: 'inherit',
                marginBottom: '24px',
              }}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.ctrlKey) {
                  handlePromptSubmit()
                }
              }}
            />
            <div
              style={{
                display: 'flex',
                gap: '12px',
                justifyContent: 'flex-end',
              }}
            >
              <button
                onClick={handlePromptCancel}
                style={{
                  padding: '12px 24px',
                  fontSize: '16px',
                  borderRadius: '8px',
                  border: '2px solid rgba(255, 255, 255, 0.2)',
                  background: 'transparent',
                  color: 'white',
                  cursor: 'pointer',
                  fontWeight: '500',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent'
                }}
              >
                Skip (Random)
              </button>
              <button
                onClick={handlePromptSubmit}
                style={{
                  padding: '12px 24px',
                  fontSize: '16px',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  color: 'white',
                  cursor: 'pointer',
                  fontWeight: '500',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'scale(1.05)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'scale(1)'
                }}
              >
                Generate {userPrompt.trim() ? '(Ctrl+Enter)' : ''}
              </button>
            </div>
            <p
              style={{
                margin: '16px 0 0 0',
                fontSize: '13px',
                color: '#666',
                textAlign: 'center',
              }}
            >
              Tip: Press Ctrl+Enter to generate quickly
            </p>
          </div>
        </div>
      )}

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
          {generationError ? (
            <>
              <div style={{ fontSize: '48px' }}>⚠️</div>
              <div style={{ fontSize: '24px', fontWeight: 'bold' }}>Generation Error</div>
              <div style={{ fontSize: '16px', color: '#ff6b6b', textAlign: 'center', maxWidth: '400px' }}>
                {generationError}
              </div>
              <div style={{ fontSize: '14px', color: '#aaa', textAlign: 'center', maxWidth: '400px' }}>
                Please try navigating back and returning to this position.
              </div>
            </>
          ) : isGenerating ? (
            <>
              <div style={{ fontSize: '48px', animation: 'pulse 2s ease-in-out infinite' }}>✨</div>
              <div style={{ fontSize: '24px', fontWeight: 'bold' }}>Generating New Space...</div>
              <div style={{ fontSize: '16px', color: '#aaa', textAlign: 'center', maxWidth: '400px' }}>
                Creating a unique 3D environment for you. This may take 20-40 seconds.
              </div>
              <div
                style={{
                  marginTop: '20px',
                  width: '200px',
                  height: '4px',
                  background: 'rgba(255, 255, 255, 0.1)',
                  borderRadius: '2px',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    background: 'linear-gradient(90deg, #4CAF50, #2196F3)',
                    animation: 'loading 1.5s ease-in-out infinite',
                    width: '50%',
                  }}
                />
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: '48px' }}>🌌</div>
              <div style={{ fontSize: '24px', fontWeight: 'bold' }}>Uncharted Territory</div>
              <div style={{ fontSize: '16px', color: '#aaa', textAlign: 'center', maxWidth: '400px' }}>
                This location hasn't been generated yet. Soon, a new 3D space will be created here!
              </div>
            </>
          )}
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
          <style jsx>{`
            @keyframes pulse {
              0%, 100% { opacity: 1; }
              50% { opacity: 0.5; }
            }
            @keyframes loading {
              0% { transform: translateX(-100%); }
              100% { transform: translateX(200%); }
            }
          `}</style>
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
