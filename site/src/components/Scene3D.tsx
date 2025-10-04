import { Canvas } from '@react-three/fiber'
import { OrbitControls, useGLTF } from '@react-three/drei'
import { Suspense } from 'react'
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

interface Scene3DProps {
  modelPath: string
  rotation?: [number, number, number]
}

export default function Scene3D({ modelPath, rotation }: Scene3DProps) {
  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <Canvas
        camera={{
          position: [0, 1.6, 0.5], // Position camera at eye level, slightly back
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
            target={[0, 1.6, 0]} // Look at origin point at eye level
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
