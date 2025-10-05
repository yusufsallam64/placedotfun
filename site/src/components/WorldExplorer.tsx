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
  const [worldGrid, setWorldGrid] = useState<WorldGrid>({})
  const [isLoading, setIsLoading] = useState(true) // Start as loading while fetching chunks
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationError, setGenerationError] = useState<string | null>(null)
  const [cameraRotation, setCameraRotation] = useState<THREE.Euler | null>(null)
  const [showPromptModal, setShowPromptModal] = useState(false)
  const [userPrompt, setUserPrompt] = useState('')
  const [referenceImage, setReferenceImage] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [pendingPosition, setPendingPosition] = useState<GridPosition | null>(null)
  const [previousPosition, setPreviousPosition] = useState<GridPosition>({ x: 0, y: 0 })
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [preloadedScenes, setPreloadedScenes] = useState<Set<string>>(new Set())
  const cameraRotationRef = useRef<THREE.Euler | null>(null)
  const boundaryReachedRef = useRef(false)
  const boundaryTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const generationQueueRef = useRef<Set<string>>(new Set())

  const getPositionKey = (pos: GridPosition): string => `${pos.x},${pos.y}`

  // Load existing chunks from MongoDB on mount
  useEffect(() => {
    async function loadChunks() {
      try {
        // Start with hardcoded local chunks
        const grid: WorldGrid = {
          '0,0': {
            modelPath: '/scene-0-0.glb',
            rotation: [Math.PI / 2, 0, 0],
          },
          '0,1': {
            modelPath: '/scene-0-1.glb',
            rotation: [Math.PI / 2, 0, 0],
          },
        }
        const discovered = new Set<string>(['0,0', '0,1'])

        // Load additional chunks from database
        console.log('[WorldExplorer] Loading chunks from database...')
        const response = await fetch('/api/chunks?limit=100')
        if (!response.ok) {
          throw new Error('Failed to fetch chunks')
        }

        const chunks = await response.json()
        console.log(`[WorldExplorer] Loaded ${chunks.length} chunks from database`)

        for (const chunk of chunks) {
          const key = `${chunk.position.x},${chunk.position.z}`

          // Skip (0,0) and (0,1) - we use local files for these
          if (key === '0,0' || key === '0,1') {
            console.log(`[WorldExplorer] Skipping ${key} - using local file`)
            continue
          }

          grid[key] = {
            modelPath: chunk.modelUrl,
            rotation: [Math.PI / 2, 0, 0],
          }
          discovered.add(key)
        }

        setWorldGrid(grid)
        setDiscoveredPositions(discovered)
      } catch (error) {
        console.error('[WorldExplorer] Failed to load chunks:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadChunks()
  }, [])

  const getCurrentSceneData = (): SceneData | null => {
    const key = getPositionKey(currentPosition)
    return worldGrid[key] || null
  }

  // Mark current position as discovered whenever it changes
  useEffect(() => {
    const key = getPositionKey(currentPosition)
    setDiscoveredPositions((prev) => new Set(prev).add(key))
  }, [currentPosition])

  // Preload adjacent scenes for smoother transitions
  useEffect(() => {
    const adjacentPositions = [
      { x: currentPosition.x, y: currentPosition.y + 1 }, // north
      { x: currentPosition.x, y: currentPosition.y - 1 }, // south
      { x: currentPosition.x + 1, y: currentPosition.y }, // east
      { x: currentPosition.x - 1, y: currentPosition.y }, // west
    ]

    adjacentPositions.forEach((pos) => {
      const key = getPositionKey(pos)
      const sceneData = worldGrid[key]

      if (sceneData && !preloadedScenes.has(key)) {
        // Preload the GLB model
        const link = document.createElement('link')
        link.rel = 'prefetch'
        link.href = sceneData.modelPath
        link.as = 'fetch'
        document.head.appendChild(link)

        setPreloadedScenes((prev) => new Set(prev).add(key))

        console.log(`[WorldExplorer] Preloaded scene at (${pos.x}, ${pos.y})`)
      }
    })
  }, [currentPosition, worldGrid, preloadedScenes])

  // Handle image upload
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      // Validate file size (max 10MB)
      const maxSize = 10 * 1024 * 1024 // 10MB in bytes
      if (file.size > maxSize) {
        alert('Image file is too large. Please upload an image smaller than 10MB.')
        e.target.value = '' // Reset input
        return
      }

      // Validate file type
      if (!file.type.startsWith('image/')) {
        alert('Please upload a valid image file.')
        e.target.value = '' // Reset input
        return
      }

      console.log(`[WorldExplorer] Image selected: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB)`)
      
      setReferenceImage(file)
      // Create preview URL
      const reader = new FileReader()
      reader.onloadend = () => {
        setImagePreview(reader.result as string)
      }
      reader.onerror = () => {
        console.error('[WorldExplorer] Failed to read image file')
        alert('Failed to read image file. Please try another image.')
      }
      reader.readAsDataURL(file)
    }
  }

  const removeImage = () => {
    setReferenceImage(null)
    setImagePreview(null)
  }

  // Generate scene for unmapped positions
  const generateScene = async (position: GridPosition, customPrompt?: string, refImage?: File | null) => {
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
      if (refImage) {
        console.log(`[WorldExplorer] With reference image: ${refImage.name}`)
      }

      // Convert image to base64 if provided
      let imageBase64: string | undefined
      if (refImage) {
        try {
          console.log(`[WorldExplorer] Converting image to base64...`)
          const reader = new FileReader()
          imageBase64 = await new Promise<string>((resolve, reject) => {
            reader.onloadend = () => {
              const result = reader.result as string
              console.log(`[WorldExplorer] Base64 conversion complete (length: ${result.length})`)
              resolve(result)
            }
            reader.onerror = () => {
              console.error('[WorldExplorer] FileReader error:', reader.error)
              reject(new Error('Failed to read image file'))
            }
            reader.readAsDataURL(refImage)
          })
        } catch (imageError) {
          console.error('[WorldExplorer] Failed to convert image:', imageError)
          throw new Error('Failed to process reference image. Please try a different image.')
        }
      }

      console.log(`[WorldExplorer] Sending generation request...`)
      const response = await fetch('/api/generate-scene', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          x: position.x,
          y: position.y,
          userPrompt: customPrompt || undefined,
          referenceImage: imageBase64 || undefined,
        }),
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        console.error('[WorldExplorer] Generation failed:', data.error)
        throw new Error(data.error || 'Failed to generate scene')
      }

      console.log(`[WorldExplorer] Scene generated successfully:`, data.modelUrl)

      // Add to world grid with proper rotation
      setWorldGrid((prev) => ({
        ...prev,
        [key]: {
          modelPath: data.modelUrl, // Use S3 URL from response
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
    // Start transition
    setIsTransitioning(true)
    setIsLoading(true)

    // After fade out, change position
    setTimeout(() => {
      setCurrentPosition(newPosition)
      setIsLoading(false)
    }, 300) // 300ms fade out

    // End transition after fade in
    setTimeout(() => {
      setIsTransitioning(false)
    }, 600) // 300ms fade out + 300ms fade in
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
    if (boundaryReachedRef.current || isTransitioning) return

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
    }, 1200) // Increased to account for transition time

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
      generateScene(pendingPosition, userPrompt.trim() || undefined, referenceImage)
      setPendingPosition(null)
      setUserPrompt('')
      setReferenceImage(null)
      setImagePreview(null)
    }
  }

  const handlePromptCancel = () => {
    setShowPromptModal(false)
    if (pendingPosition) {
      // Generate with no custom prompt but possibly with reference image
      generateScene(pendingPosition, undefined, referenceImage)
      setPendingPosition(null)
    }
    setUserPrompt('')
    setReferenceImage(null)
    setImagePreview(null)
  }

  const currentSceneData = getCurrentSceneData()

  return (
    <>
      <style>
        {`
          @keyframes fadeIn {
            from {
              opacity: 0;
            }
            to {
              opacity: 1;
            }
          }
        `}
      </style>
      <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
        {/* Transition Fade Overlay */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'black',
          opacity: isTransitioning ? 1 : 0,
          transition: 'opacity 300ms ease-in-out',
          pointerEvents: 'none',
          zIndex: 1500,
        }}
      />

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
                marginBottom: '16px',
              }}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.ctrlKey) {
                  handlePromptSubmit()
                }
              }}
            />
            
            {/* Image Upload Section */}
            <div style={{ marginBottom: '24px' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '600',
                  color: '#ddd',
                  marginBottom: '8px',
                }}
              >
                Reference Image (Optional)
              </label>
              <p
                style={{
                  fontSize: '13px',
                  color: '#999',
                  marginBottom: '12px',
                  lineHeight: '1.5',
                }}
              >
                Upload an image to inspire the panoramic generation. Elements and lighting from your image will be incorporated.
              </p>
              
              {imagePreview ? (
                <div
                  style={{
                    position: 'relative',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    border: '2px solid rgba(255, 255, 255, 0.2)',
                  }}
                >
                  <img
                    src={imagePreview}
                    alt="Reference preview"
                    style={{
                      width: '100%',
                      height: 'auto',
                      maxHeight: '200px',
                      objectFit: 'cover',
                      display: 'block',
                    }}
                  />
                  <button
                    onClick={removeImage}
                    style={{
                      position: 'absolute',
                      top: '8px',
                      right: '8px',
                      padding: '8px 12px',
                      fontSize: '14px',
                      borderRadius: '6px',
                      border: 'none',
                      background: 'rgba(220, 38, 38, 0.9)',
                      color: 'white',
                      cursor: 'pointer',
                      fontWeight: '500',
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(220, 38, 38, 1)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(220, 38, 38, 0.9)'
                    }}
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '24px',
                    borderRadius: '8px',
                    border: '2px dashed rgba(255, 255, 255, 0.3)',
                    background: 'rgba(0, 0, 0, 0.2)',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.5)'
                    e.currentTarget.style.background = 'rgba(0, 0, 0, 0.3)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)'
                    e.currentTarget.style.background = 'rgba(0, 0, 0, 0.2)'
                  }}
                >
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    style={{ display: 'none' }}
                  />
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '32px', marginBottom: '8px' }}>📸</div>
                    <div style={{ fontSize: '14px', color: '#bbb', fontWeight: '500' }}>
                      Click to upload an image
                    </div>
                    <div style={{ fontSize: '12px', color: '#777', marginTop: '4px' }}>
                      PNG, JPG, WEBP up to 10MB
                    </div>
                  </div>
                </label>
              )}
            </div>
            <div
              style={{
                display: 'flex',
                gap: '12px',
                justifyContent: 'space-between',
              }}
            >
              <button
                onClick={() => {
                  setShowPromptModal(false)
                  setPendingPosition(null)
                  setUserPrompt('')
                  setReferenceImage(null)
                  setImagePreview(null)
                  // Navigate back to a discovered position
                  const discovered = Array.from(discoveredPositions)
                  const validPositions = discovered.filter(key => worldGrid[key] && key !== getPositionKey(currentPosition))
                  if (validPositions.length > 0) {
                    const lastValid = validPositions[validPositions.length - 1]
                    const [x, y] = lastValid.split(',').map(Number)
                    moveToPosition({ x, y })
                  }
                }}
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
                ← Go Back
              </button>
              <div style={{ display: 'flex', gap: '12px' }}>
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
        <div
          style={{
            width: '100vw',
            height: '100vh',
            animation: 'fadeIn 400ms ease-in',
          }}
        >
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
        </div>
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
              <button
                onClick={() => {
                  // Find the last discovered position that has a scene
                  const discovered = Array.from(discoveredPositions)
                  const validPositions = discovered.filter(key => worldGrid[key])
                  if (validPositions.length > 0) {
                    // Go to the most recently discovered valid position
                    const lastValid = validPositions[validPositions.length - 1]
                    const [x, y] = lastValid.split(',').map(Number)
                    moveToPosition({ x, y })
                  }
                }}
                style={{
                  marginTop: '24px',
                  padding: '12px 32px',
                  fontSize: '16px',
                  borderRadius: '8px',
                  border: '2px solid rgba(255, 255, 255, 0.3)',
                  background: 'rgba(255, 255, 255, 0.1)',
                  color: 'white',
                  cursor: 'pointer',
                  fontWeight: '500',
                  transition: 'all 0.2s',
                  backdropFilter: 'blur(10px)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)'
                  e.currentTarget.style.transform = 'scale(1.05)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'
                  e.currentTarget.style.transform = 'scale(1)'
                }}
              >
                ← Go Back & Explore
              </button>
              <div style={{ fontSize: '14px', color: '#666', marginTop: '12px', textAlign: 'center', maxWidth: '400px' }}>
                Continue exploring while this space generates in the background
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
        <div>• Hold Shift to sprint</div>
        <div>• Space to jump</div>
        <div>• Scroll to zoom</div>
        <div>• ESC to unlock cursor</div>
      </div>

    </div>
    </>
  )
}
