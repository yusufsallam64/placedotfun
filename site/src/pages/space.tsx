import { useState, useRef } from 'react';
import Head from 'next/head';

export default function DepthPage() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [panoramaUrl, setPanoramaUrl] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [processingType, setProcessingType] = useState<'depth' | '3d' | 'panorama'>('3d');
  const [usePanoramaAI, setUsePanoramaAI] = useState(false);
  const [customPrompt, setCustomPrompt] = useState('');
  const [saveToWorld, setSaveToWorld] = useState(true);
  const [chunkX, setChunkX] = useState(0);
  const [chunkZ, setChunkZ] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setError('');
      setPanoramaUrl(''); // Clear previous panorama result
      
      // Create preview
      const reader = new FileReader();
      reader.onload = (e) => {
        setPreviewUrl(e.target?.result as string);
      };
      reader.readAsDataURL(selectedFile);
    }
  };

  const handleDepthEstimation = async () => {
    if (!file) {
      setError('Please select an image first');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/space?type=depth', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      // Download the depth map
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `depth_${file.name}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      alert('Depth map downloaded!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process image');
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handlePanoramaConversion = async () => {
    if (!file) {
      setError('Please select an image first');
      return;
    }

    setLoading(true);
    setError('');
    setPanoramaUrl('');

    try {
      const formData = new FormData();
      formData.append('file', file);

      const params = new URLSearchParams({
        type: 'panorama',
        ...(customPrompt && { prompt: customPrompt }),
      });

      const response = await fetch(`/api/space?${params}`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `API error: ${response.status}`);
      }

      // Display the panoramic image
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      setPanoramaUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to convert to panorama');
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate3D = async () => {
    if (!file) {
      setError('Please select an image first');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('file', file);

      // Use Next.js API route
      const params = new URLSearchParams({
        type: '3d',
        panorama: usePanoramaAI.toString(),
        ...(usePanoramaAI && customPrompt && { prompt: customPrompt }),
        ...(saveToWorld && { saveToWorld: 'true', x: chunkX.toString(), z: chunkZ.toString() }),
      });

      const response = await fetch(`/api/space?${params}`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `API error: ${response.status}`);
      }

      // Get metadata from headers
      const vertices = response.headers.get('X-Vertices');
      const faces = response.headers.get('X-Faces');
      const chunkId = response.headers.get('X-Chunk-Id');
      const savedX = response.headers.get('X-Chunk-X');
      const savedZ = response.headers.get('X-Chunk-Z');
      
      // Download the GLB file
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `space_${file.name.replace(/\.[^/.]+$/, '')}.glb`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      let message = `3D space created!\nVertices: ${vertices || 'N/A'}\nFaces: ${faces || 'N/A'}`;
      if (chunkId) {
        message += `\n\n✅ Saved to world at (${savedX}, ${savedZ})`;
      }
      alert(message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create 3D space');
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>3D Space Creator - AI Powered</title>
        <meta name="description" content="Convert images to 3D spaces with AI" />
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 text-white p-8">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="text-center mb-12">
            <h1 className="text-5xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-600">
              3D Space Creator
            </h1>
            <p className="text-gray-300 text-lg">
              AI-Powered Depth & 3D Reconstruction
            </p>
          </div>

          {/* Main Card */}
          <div className="bg-gray-800 rounded-2xl shadow-2xl p-8 backdrop-blur-lg bg-opacity-80">
            {/* Type Selection */}
            <div className="mb-8">
              <label className="block text-sm font-medium mb-4">Processing Type</label>
              <div className="grid grid-cols-3 gap-4">
                <button
                  onClick={() => { setProcessingType('depth'); setPanoramaUrl(''); }}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    processingType === 'depth'
                      ? 'border-purple-500 bg-purple-500 bg-opacity-20'
                      : 'border-gray-600 hover:border-gray-500'
                  }`}
                >
                  <div className="text-lg font-semibold mb-1">Depth Map</div>
                  <div className="text-sm text-gray-400">
                    Estimate depth from any image
                  </div>
                </button>
                <button
                  onClick={() => { setProcessingType('panorama'); setPanoramaUrl(''); }}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    processingType === 'panorama'
                      ? 'border-purple-500 bg-purple-500 bg-opacity-20'
                      : 'border-gray-600 hover:border-gray-500'
                  }`}
                >
                  <div className="text-lg font-semibold mb-1">Panorama AI</div>
                  <div className="text-sm text-gray-400">
                    Convert to 360° panorama
                  </div>
                </button>
                <button
                  onClick={() => { setProcessingType('3d'); setPanoramaUrl(''); }}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    processingType === '3d'
                      ? 'border-purple-500 bg-purple-500 bg-opacity-20'
                      : 'border-gray-600 hover:border-gray-500'
                  }`}
                >
                  <div className="text-lg font-semibold mb-1">3D Space</div>
                  <div className="text-sm text-gray-400">
                    Create 3D mesh from any image
                  </div>
                </button>
              </div>
              
              {processingType === '3d' && (
                <div className="mt-4 space-y-3">
                  <div className="flex items-center gap-3 p-3 bg-gray-700 rounded-lg">
                    <input
                      type="checkbox"
                      id="panoramaAI"
                      checked={usePanoramaAI}
                      onChange={(e) => setUsePanoramaAI(e.target.checked)}
                      className="w-5 h-5 rounded border-gray-600 text-purple-600 focus:ring-purple-500 focus:ring-offset-gray-800"
                    />
                    <label htmlFor="panoramaAI" className="text-sm cursor-pointer">
                      <span className="font-medium">Use Gemini AI to make image panoramic</span>
                      <span className="block text-xs text-gray-400 mt-1">
                        Converts regular photos to 360° before 3D creation (slower but better quality)
                      </span>
                    </label>
                  </div>
                  
                  {usePanoramaAI && (
                    <div className="p-3 bg-gray-700 rounded-lg">
                      <label htmlFor="customPrompt" className="block text-sm font-medium mb-2">
                        Custom Instructions (Optional)
                      </label>
                      <input
                        type="text"
                        id="customPrompt"
                        value={customPrompt}
                        onChange={(e) => setCustomPrompt(e.target.value)}
                        placeholder="e.g., make it more dramatic, add sunset lighting..."
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      />
                      <p className="text-xs text-gray-400 mt-1">
                        Add specific instructions for the AI panorama generation
                      </p>
                    </div>
                  )}
                  
                  {/* World Persistence Options */}
                  <div className="p-3 bg-gradient-to-r from-green-900/30 to-blue-900/30 rounded-lg border border-green-500/30">
                    <div className="flex items-center gap-3 mb-3">
                      <input
                        type="checkbox"
                        id="saveToWorld"
                        checked={saveToWorld}
                        onChange={(e) => setSaveToWorld(e.target.checked)}
                        className="w-5 h-5 rounded border-gray-600 text-green-600 focus:ring-green-500 focus:ring-offset-gray-800"
                      />
                      <label htmlFor="saveToWorld" className="text-sm cursor-pointer">
                        <span className="font-medium text-green-400">🌍 Save to Persistent World</span>
                        <span className="block text-xs text-gray-400 mt-1">
                          Add this chunk to the shared world that all users can see
                        </span>
                      </label>
                    </div>
                    
                    {saveToWorld && (
                      <div className="pl-8 space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label htmlFor="chunkX" className="block text-xs font-medium mb-1 text-gray-300">
                              Chunk X
                            </label>
                            <input
                              type="number"
                              id="chunkX"
                              value={chunkX}
                              onChange={(e) => setChunkX(parseInt(e.target.value) || 0)}
                              className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                            />
                          </div>
                          <div>
                            <label htmlFor="chunkZ" className="block text-xs font-medium mb-1 text-gray-300">
                              Chunk Z
                            </label>
                            <input
                              type="number"
                              id="chunkZ"
                              value={chunkZ}
                              onChange={(e) => setChunkZ(parseInt(e.target.value) || 0)}
                              className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                            />
                          </div>
                        </div>
                        <p className="text-xs text-gray-400">
                          Position in world grid. (0,0) is spawn. Each chunk is ~10 units.
                        </p>
                        <a
                          href="/world"
                          target="_blank"
                          className="inline-block text-xs text-green-400 hover:text-green-300 underline"
                        >
                          View World Map →
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Custom Prompt for Panorama Type */}
            {processingType === 'panorama' && (
              <div className="mb-6 p-4 bg-gray-700 rounded-lg">
                <label htmlFor="panoramaPrompt" className="block text-sm font-medium mb-2">
                  Custom Instructions (Optional)
                </label>
                <input
                  type="text"
                  id="panoramaPrompt"
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  placeholder="e.g., make it more vibrant, add sunset colors, make it dramatic..."
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Add specific instructions to customize the AI panorama generation
                </p>
              </div>
            )}

            {/* File Upload */}
            <div className="mb-8">
              <label className="block text-sm font-medium mb-4">
                {processingType === 'depth' ? 'Upload Image' : 'Upload 360° Panorama'}
              </label>
              
              <div className="flex items-center gap-4">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-6 py-3 bg-purple-600 hover:bg-purple-700 rounded-lg font-medium transition-colors"
                >
                  Choose File
                </button>
                {file && (
                  <span className="text-sm text-gray-300 truncate max-w-md">
                    {file.name}
                  </span>
                )}
              </div>
            </div>

            {/* Preview */}
            {previewUrl && !panoramaUrl && (
              <div className="mb-8">
                <label className="block text-sm font-medium mb-4">Preview</label>
                <div className="relative rounded-lg overflow-hidden bg-gray-900">
                  <img
                    src={previewUrl}
                    alt="Preview"
                    className="w-full h-auto max-h-96 object-contain"
                  />
                </div>
              </div>
            )}

            {/* Side-by-Side Comparison for Panorama */}
            {panoramaUrl && processingType === 'panorama' && (
              <div className="mb-8">
                <label className="block text-sm font-medium mb-4">Before & After Comparison</label>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <div className="text-xs text-gray-400 mb-2 font-medium">ORIGINAL</div>
                    <div className="relative rounded-lg overflow-hidden bg-gray-900 border-2 border-gray-700">
                      <img
                        src={previewUrl}
                        alt="Original"
                        className="w-full h-auto object-contain"
                      />
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-400 mb-2 font-medium">PANORAMIC (AI)</div>
                    <div className="relative rounded-lg overflow-hidden bg-gray-900 border-2 border-purple-500">
                      <img
                        src={panoramaUrl}
                        alt="Panoramic"
                        className="w-full h-auto object-contain"
                      />
                    </div>
                  </div>
                </div>
                
                {/* Download Button */}
                <button
                  onClick={() => {
                    const a = document.createElement('a');
                    a.href = panoramaUrl;
                    a.download = `panoramic_${file?.name.replace(/\.[^/.]+$/, '') || 'image'}.jpg`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                  }}
                  className="w-full py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-semibold rounded-lg shadow-lg hover:shadow-xl transition-all duration-300"
                >
                  ⬇️ Download Panoramic Image
                </button>
              </div>
            )}

            {/* Error Display */}
            {error && (
              <div className="mb-6 p-4 bg-red-900 bg-opacity-50 border border-red-500 rounded-lg">
                <p className="text-red-200">{error}</p>
              </div>
            )}

            {/* Action Button */}
            <button
              onClick={
                processingType === 'depth' 
                  ? handleDepthEstimation 
                  : processingType === 'panorama'
                  ? handlePanoramaConversion
                  : handleCreate3D
              }
              disabled={!file || loading}
              className={`w-full py-4 rounded-lg font-semibold text-lg transition-all ${
                !file || loading
                  ? 'bg-gray-600 cursor-not-allowed'
                  : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 shadow-lg hover:shadow-xl'
              }`}
            >
              {loading ? (
                <div className="flex items-center justify-center gap-3">
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>
                    {processingType === 'panorama' 
                      ? 'Converting with Gemini AI...' 
                      : usePanoramaAI 
                      ? 'Processing with AI...' 
                      : 'Processing...'}
                  </span>
                </div>
              ) : processingType === 'depth' ? (
                'Generate Depth Map'
              ) : processingType === 'panorama' ? (
                '🤖 Convert to Panorama'
              ) : (
                'Create 3D Space'
              )}
            </button>

            {/* Info */}
            <div className="mt-8 p-4 bg-blue-900 bg-opacity-30 border border-blue-500 rounded-lg">
              <h3 className="font-semibold mb-2">ℹ️ Information</h3>
              <ul className="text-sm text-gray-300 space-y-1">
                {processingType === 'depth' ? (
                  <>
                    <li>• Estimates depth from any image</li>
                    <li>• Returns a colored depth map (PNG)</li>
                    <li>• Processing takes ~1-2 seconds</li>
                  </>
                ) : processingType === 'panorama' ? (
                  <>
                    <li>• Converts any image to a 360° panorama using Gemini AI</li>
                    <li>• Analyzes your image and generates a seamless panoramic scene</li>
                    <li>• Ultra-wide 21:9 aspect ratio for cinematic quality</li>
                    <li>• Processing takes ~10-15 seconds</li>
                    <li>• Perfect for creating immersive environments</li>
                  </>
                ) : (
                  <>
                    <li>• Upload any image to create a 3D space</li>
                    <li>• Returns a GLB 3D mesh file</li>
                    <li>• Processing takes ~20-30 seconds</li>
                    <li>• Enable Gemini AI for better panoramic conversion (adds ~10s)</li>
                    <li>• View GLB files in Blender, Three.js, or online viewers</li>
                  </>
                )}
              </ul>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-8 text-center text-gray-400 text-sm">
            <p>API: ZoeDepth + Gemini AI</p>
          </div>
        </div>
      </div>
    </>
  );
}
