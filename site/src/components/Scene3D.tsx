import { Canvas } from '@react-three/fiber'
import { OrbitControls, useGLTF } from '@react-three/drei'
import { Suspense } from 'react'
import * as THREE from 'three'

interface SceneModelProps {
  modelPath: string
}

function SceneModel({ modelPath }: SceneModelProps) {
  const { scene } = useGLTF(modelPath)

  return <primitive object={scene} />
}

interface Scene3DProps {
  modelPath: string
}

export default function Scene3D({ modelPath }: Scene3DProps) {
  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <Canvas
        camera={{
          position: [0, 1.6, 0], // Human eye level height
          fov: 75,
        }}
        gl={{
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1,
        }}
      >
        <Suspense fallback={null}>
          <SceneModel modelPath={modelPath} />

          {/* Ambient light for overall illumination */}
          <ambientLight intensity={0.5} />

          {/* Directional light for depth */}
          <directionalLight position={[5, 5, 5]} intensity={1} />

          {/* Camera controls - first-person rotation style */}
          <OrbitControls
            makeDefault
            enablePan={false} // Disable panning for first-person feel
            enableZoom={true} // Allow zoom to move forward/back a bit
            enableRotate={true} // Enable rotation to look around
            minDistance={0.5} // Minimum distance from target
            maxDistance={3} // Maximum distance from target
            maxPolarAngle={Math.PI * 0.95} // Prevent looking too far down
            minPolarAngle={Math.PI * 0.05} // Prevent looking too far up
            target={[0, 1.6, -1]} // Look forward at eye level
            rotateSpeed={0.8}
            zoomSpeed={0.5}
            enableDamping={true} // Smooth rotation
            dampingFactor={0.05}
          />
        </Suspense>
      </Canvas>
    </div>
  )
}
