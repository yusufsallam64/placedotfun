import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useGLTF, PointerLockControls } from '@react-three/drei'
import { Suspense, useEffect, useRef, useState } from 'react'
import * as THREE from 'three'

interface SceneModelProps {
  modelPath: string
  rotation?: [number, number, number]
}

function SceneModel({ modelPath, rotation = [0, 0, 0] }: SceneModelProps) {
  const { scene } = useGLTF(modelPath)

  return (
    <group rotation={rotation}>
      <primitive object={scene} />
    </group>
  )
}

interface WASDControlsProps {
  moveSpeed?: number
  maxDistance?: number
  onBoundaryReached?: (direction: 'north' | 'south' | 'east' | 'west') => void
}

function WASDControls({ moveSpeed = 0.05, maxDistance = 2.5, onBoundaryReached }: WASDControlsProps) {
  const { camera } = useThree()
  const moveState = useRef({ forward: false, backward: false, left: false, right: false })
  const isSprinting = useRef(false)
  const velocity = useRef(new THREE.Vector3())
  const startPosition = useRef(new THREE.Vector3(0, 1.6, 0.5))
  const isJumping = useRef(false)
  const jumpVelocity = useRef(0)
  const groundHeight = 1.6
  const sprintMultiplier = 2.0 // Sprint is 2x faster

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key.toLowerCase()) {
        case 'w':
          moveState.current.forward = true
          break
        case 's':
          moveState.current.backward = true
          break
        case 'a':
          moveState.current.left = true
          break
        case 'd':
          moveState.current.right = true
          break
        case 'shift':
          isSprinting.current = true
          break
        case ' ':
          // Jump
          if (!isJumping.current) {
            isJumping.current = true
            jumpVelocity.current = 0.15
          }
          e.preventDefault()
          break
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      switch (e.key.toLowerCase()) {
        case 'w':
          moveState.current.forward = false
          break
        case 's':
          moveState.current.backward = false
          break
        case 'a':
          moveState.current.left = false
          break
        case 'd':
          moveState.current.right = false
          break
        case 'shift':
          isSprinting.current = false
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [])

  useFrame(() => {
    const direction = new THREE.Vector3()
    const right = new THREE.Vector3()

    camera.getWorldDirection(direction)
    direction.y = 0
    direction.normalize()

    right.crossVectors(camera.up, direction).normalize()

    velocity.current.set(0, 0, 0)

    // Apply sprint multiplier if shift is held
    const currentSpeed = isSprinting.current ? moveSpeed * sprintMultiplier : moveSpeed

    if (moveState.current.forward) velocity.current.add(direction.multiplyScalar(currentSpeed))
    if (moveState.current.backward) velocity.current.add(direction.multiplyScalar(-currentSpeed))
    if (moveState.current.left) velocity.current.add(right.multiplyScalar(currentSpeed))
    if (moveState.current.right) velocity.current.add(right.multiplyScalar(-currentSpeed))

    // Handle jump physics
    if (isJumping.current) {
      camera.position.y += jumpVelocity.current
      jumpVelocity.current -= 0.01 // Gravity

      // Check if landed
      if (camera.position.y <= groundHeight) {
        camera.position.y = groundHeight
        isJumping.current = false
        jumpVelocity.current = 0
      }
    }

    const newPosition = camera.position.clone().add(velocity.current)
    const distance = new THREE.Vector2(
      newPosition.x - startPosition.current.x,
      newPosition.z - startPosition.current.z
    ).length()

    // Check if we're at the boundary
    if (distance >= maxDistance) {
      // Calculate which direction we're trying to go
      const offset = newPosition.clone().sub(startPosition.current)

      if (onBoundaryReached) {
        if (Math.abs(offset.x) > Math.abs(offset.z)) {
          if (offset.x > 0) onBoundaryReached('east')
          else onBoundaryReached('west')
        } else {
          if (offset.z > 0) onBoundaryReached('south')
          else onBoundaryReached('north')
        }
      }
    } else {
      camera.position.add(velocity.current)
    }
  })

  return null
}

interface CameraManagerProps {
  initialRotation?: { euler: THREE.Euler }
  onRotationChange?: (euler: THREE.Euler) => void
}

function CameraManager({ initialRotation, onRotationChange }: CameraManagerProps) {
  const { camera } = useThree()
  const initialized = useRef(false)

  useEffect(() => {
    if (initialRotation && !initialized.current) {
      camera.rotation.copy(initialRotation.euler)
      initialized.current = true
    }
  }, [initialRotation, camera])

  useFrame(() => {
    if (onRotationChange) {
      onRotationChange(camera.rotation.clone())
    }
  })

  return null
}

interface ZoomControlsProps {
  minDistance?: number
  maxDistance?: number
}

function ZoomControls({ minDistance = 0.5, maxDistance = 3 }: ZoomControlsProps) {
  const { camera } = useThree()

  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()

      const fovChange = e.deltaY * 0.05
      const newFov = THREE.MathUtils.clamp(camera.fov + fovChange, 40, 100)
      camera.fov = newFov
      camera.updateProjectionMatrix()
    }

    window.addEventListener('wheel', handleWheel, { passive: false })

    return () => {
      window.removeEventListener('wheel', handleWheel)
    }
  }, [camera])

  return null
}

interface Scene3DProps {
  modelPath: string
  rotation?: [number, number, number]
  moveSpeed?: number
  maxDistance?: number
  onBoundaryReached?: (direction: 'north' | 'south' | 'east' | 'west') => void
  initialCameraRotation?: { euler: THREE.Euler }
  onCameraRotationChange?: (euler: THREE.Euler) => void
}

export default function Scene3D({
  modelPath,
  rotation,
  moveSpeed,
  maxDistance,
  onBoundaryReached,
  initialCameraRotation,
  onCameraRotationChange
}: Scene3DProps) {
  const [hasSeenInstruction, setHasSeenInstruction] = useState(false)

  useEffect(() => {
    const seen = localStorage.getItem('hasSeenClickInstruction')
    if (seen) {
      setHasSeenInstruction(true)
    }
  }, [])

  useEffect(() => {
    const handlePointerLock = () => {
      const instruction = document.getElementById('click-instruction')
      if (instruction) {
        instruction.style.display = 'none'
        localStorage.setItem('hasSeenClickInstruction', 'true')
        setHasSeenInstruction(true)
      }
    }

    const handlePointerUnlock = () => {
      const instruction = document.getElementById('click-instruction')
      if (instruction && !hasSeenInstruction) {
        instruction.style.display = 'block'
      }
    }

    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement) {
        handlePointerLock()
      } else {
        handlePointerUnlock()
      }
    })

    return () => {
      document.removeEventListener('pointerlockchange', handlePointerLock)
    }
  }, [hasSeenInstruction])

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <Canvas
        camera={{
          position: [0, 1.6, 0.5],
          fov: 75,
        }}
        gl={{
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1,
        }}
      >
        <Suspense fallback={null}>
          <SceneModel modelPath={modelPath} rotation={rotation} />

          {/* Ambient light for overall illumination */}
          <ambientLight intensity={2.5} />

          {/* Point light in the center of the scene */}
          <pointLight position={[0, 2, 0]} intensity={10} distance={20} decay={1} />

          {/* Additional point lights for better coverage */}
          <pointLight position={[3, 1.6, 0]} intensity={5} distance={15} decay={1} />
          <pointLight position={[-3, 1.6, 0]} intensity={5} distance={15} decay={1} />
          <pointLight position={[0, 1.6, 3]} intensity={5} distance={15} decay={1} />
          <pointLight position={[0, 1.6, -3]} intensity={5} distance={15} decay={1} />

          {/* Directional light for depth */}
          <directionalLight position={[5, 5, 5]} intensity={2} />

          {/* Mouse look controls */}
          <PointerLockControls />

          {/* Camera rotation manager */}
          <CameraManager
            initialRotation={initialCameraRotation}
            onRotationChange={onCameraRotationChange}
          />

          {/* Zoom controls */}
          <ZoomControls />

          {/* WASD movement controls */}
          <WASDControls
            moveSpeed={moveSpeed}
            maxDistance={maxDistance}
            onBoundaryReached={onBoundaryReached}
          />
        </Suspense>
      </Canvas>

      {/* Click instruction - only show if not seen before */}
      {!hasSeenInstruction && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            color: 'white',
            background: 'rgba(0, 0, 0, 0.7)',
            padding: '20px 40px',
            borderRadius: '8px',
            pointerEvents: 'none',
            fontSize: '16px',
            textAlign: 'center',
          }}
          id="click-instruction"
        >
          Click to look around • WASD to move • Hold SHIFT to sprint • SPACE to jump • Scroll to zoom
        </div>
      )}
    </div>
  )
}
