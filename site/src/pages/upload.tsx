import { useState, useRef } from 'react';
import Head from 'next/head';

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [chunkX, setChunkX] = useState(0);
  const [chunkZ, setChunkZ] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (!selectedFile.name.endsWith('.glb')) {
        setError('Please select a GLB file');
        return;
      }
      setFile(selectedFile);
      setError('');
      setSuccess('');
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setError('Please select a GLB file first');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('x', chunkX.toString());
      formData.append('z', chunkZ.toString());

      const response = await fetch('/api/chunks/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Upload failed');
      }

      setSuccess(`Successfully uploaded to position (${chunkX}, ${chunkZ})\nChunk ID: ${data.chunkId}`);
      setFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
      console.error('Upload error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>Upload GLB - Placedotfun</title>
        <meta name="description" content="Upload GLB files to the world" />
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 text-white p-8">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="text-center mb-12">
            <h1 className="text-5xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-600">
              Upload GLB File
            </h1>
            <p className="text-gray-300 text-lg">
              Upload a GLB file to S3 and MongoDB
            </p>
          </div>

          {/* Upload Form */}
          <div className="bg-gray-800 rounded-2xl shadow-2xl p-8 backdrop-blur-lg bg-opacity-80">
            {/* File Upload */}
            <div className="mb-6">
              <label className="block text-sm font-medium mb-4">
                Select GLB File
              </label>

              <div className="flex items-center gap-4">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".glb"
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
                  <div className="text-sm text-gray-300">
                    <div className="font-semibold">{file.name}</div>
                    <div className="text-xs text-gray-400">
                      {(file.size / 1024 / 1024).toFixed(1)} MB
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Coordinates */}
            <div className="mb-8">
              <label className="block text-sm font-medium mb-4">
                Chunk Position
              </label>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="chunkX" className="block text-xs font-medium mb-2 text-gray-300">
                    X Coordinate
                  </label>
                  <input
                    type="number"
                    id="chunkX"
                    value={chunkX}
                    onChange={(e) => setChunkX(parseInt(e.target.value) || 0)}
                    className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label htmlFor="chunkZ" className="block text-xs font-medium mb-2 text-gray-300">
                    Z Coordinate
                  </label>
                  <input
                    type="number"
                    id="chunkZ"
                    value={chunkZ}
                    onChange={(e) => setChunkZ(parseInt(e.target.value) || 0)}
                    className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Position in world grid. (0,0) is spawn.
              </p>
            </div>

            {/* Error Display */}
            {error && (
              <div className="mb-6 p-4 bg-red-900 bg-opacity-50 border border-red-500 rounded-lg">
                <p className="text-red-200">{error}</p>
              </div>
            )}

            {/* Success Display */}
            {success && (
              <div className="mb-6 p-4 bg-green-900 bg-opacity-50 border border-green-500 rounded-lg">
                <p className="text-green-200 whitespace-pre-line">{success}</p>
              </div>
            )}

            {/* Upload Button */}
            <button
              onClick={handleUpload}
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
                  <span>Uploading...</span>
                </div>
              ) : (
                'Upload to S3 & MongoDB'
              )}
            </button>

            {/* Info */}
            <div className="mt-8 p-4 bg-blue-900 bg-opacity-30 border border-blue-500 rounded-lg">
              <h3 className="font-semibold mb-2">ℹ️ Information</h3>
              <ul className="text-sm text-gray-300 space-y-1">
                <li>• Only GLB files are supported</li>
                <li>• File will be uploaded to S3 storage</li>
                <li>• Chunk data will be saved to MongoDB</li>
                <li>• Position determines where it appears in the world</li>
              </ul>
            </div>
          </div>

          {/* Navigation */}
          <div className="mt-8 flex gap-4 justify-center">
            <a
              href="/"
              className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white font-semibold rounded-lg transition-all"
            >
              ← Back to World
            </a>
            <a
              href="/world"
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-all"
            >
              View All Chunks
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
