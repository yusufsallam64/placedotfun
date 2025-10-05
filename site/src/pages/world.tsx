import { useState, useEffect } from 'react';
import Head from 'next/head';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei';
import { ChunkDTO } from '../types/chunk';

interface ChunkModelProps {
  chunk: ChunkDTO;
}

function ChunkModel({ chunk }: ChunkModelProps) {
  try {
    const { scene } = useGLTF(chunk.modelUrl);
    
    // Position the chunk in world space (each chunk is 10 units apart)
    const position: [number, number, number] = [
      chunk.position.x * 10,
      0,
      chunk.position.z * 10,
    ];

    return (
      <group position={position}>
        <primitive object={scene.clone()} />
      </group>
    );
  } catch (error) {
    console.error(`Failed to load chunk ${chunk._id}:`, error);
    return null;
  }
}

export default function WorldPage() {
  const [chunks, setChunks] = useState<ChunkDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [stats, setStats] = useState<{
    totalChunks: number;
    totalVertices: number;
    totalFaces: number;
  } | null>(null);

  useEffect(() => {
    loadWorld();
  }, []);

  const loadWorld = async () => {
    try {
      setLoading(true);
      setError('');

      // Load all chunks
      const chunksResponse = await fetch('/api/chunks?limit=100');
      if (!chunksResponse.ok) {
        throw new Error('Failed to load chunks');
      }
      const chunksData = await chunksResponse.json();
      setChunks(chunksData);

      // Load stats
      const statsResponse = await fetch('/api/chunks/stats');
      if (statsResponse.ok) {
        const statsData = await statsResponse.json();
        setStats(statsData);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load world');
      console.error('Error loading world:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>World - Placedotfun</title>
        <meta name="description" content="Explore the persistent 3D world" />
      </Head>

      <main className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        {/* Header */}
        <div className="p-6 bg-black/20 backdrop-blur-sm border-b border-white/10">
          <h1 className="text-4xl font-bold text-white mb-2">🌍 Persistent World</h1>
          <p className="text-gray-300">
            Explore the shared 3D world created by all users
          </p>
        </div>

        {/* Stats */}
        {stats && (
          <div className="p-6 bg-black/20 backdrop-blur-sm border-b border-white/10">
            <div className="flex gap-8 text-white">
              <div>
                <div className="text-2xl font-bold">{stats.totalChunks}</div>
                <div className="text-sm text-gray-400">Chunks</div>
              </div>
              <div>
                <div className="text-2xl font-bold">
                  {(stats.totalVertices / 1000000).toFixed(1)}M
                </div>
                <div className="text-sm text-gray-400">Vertices</div>
              </div>
              <div>
                <div className="text-2xl font-bold">
                  {(stats.totalFaces / 1000000).toFixed(1)}M
                </div>
                <div className="text-sm text-gray-400">Faces</div>
              </div>
            </div>
          </div>
        )}

        {/* World Viewer */}
        <div className="h-[calc(100vh-250px)]">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-white text-xl">Loading world...</div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-red-400 text-xl">Error: {error}</div>
            </div>
          ) : chunks.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-white text-xl">No chunks yet. Create some!</div>
            </div>
          ) : (
            <Canvas
              camera={{ position: [20, 20, 20], fov: 75 }}
              style={{ background: 'transparent' }}
            >
              <ambientLight intensity={0.5} />
              <directionalLight position={[10, 10, 5]} intensity={1} />
              <directionalLight position={[-10, -10, -5]} intensity={0.5} />
              
              {/* Grid helper */}
              <gridHelper args={[100, 50, 0x444444, 0x222222]} />

              {/* Render all chunks */}
              {chunks.map((chunk) => (
                <ChunkModel key={chunk._id} chunk={chunk} />
              ))}

              <OrbitControls />
            </Canvas>
          )}
        </div>

        {/* Chunk List */}
        <div className="p-6 bg-black/30 backdrop-blur-sm border-t border-white/10">
          <h2 className="text-2xl font-bold text-white mb-4">Chunks</h2>
          
          {chunks.length === 0 ? (
            <p className="text-gray-400">No chunks in the world yet.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-96 overflow-y-auto">
              {chunks.map((chunk) => (
                <div
                  key={chunk._id}
                  className="bg-white/5 backdrop-blur-sm rounded-lg p-4 border border-white/10"
                >
                  <div className="text-white font-semibold mb-2">
                    Chunk ({chunk.position.x}, {chunk.position.z})
                  </div>
                  <div className="text-sm text-gray-400 space-y-1">
                    <div>Vertices: {chunk.metadata.vertices.toLocaleString()}</div>
                    <div>Faces: {chunk.metadata.faces.toLocaleString()}</div>
                    <div>
                      Created: {new Date(chunk.metadata.createdAt).toLocaleDateString()}
                    </div>
                    {chunk.metadata.sourceImage && (
                      <div className="truncate">Source: {chunk.metadata.sourceImage}</div>
                    )}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <a
                      href={chunk.modelUrl}
                      download
                      className="text-xs px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded"
                    >
                      Download
                    </a>
                    <a
                      href={`/api/chunks/${chunk._id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs px-3 py-1 bg-gray-600 hover:bg-gray-700 text-white rounded"
                    >
                      Details
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="p-4 bg-black/40 backdrop-blur-sm border-t border-white/10 text-center">
          <a
            href="/space"
            className="inline-block px-6 py-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-semibold rounded-lg transition-all"
          >
            Create New Chunk
          </a>
        </div>
      </main>
    </>
  );
}
