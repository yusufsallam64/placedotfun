/**
 * API endpoint to proxy chunk GLB models from S3
 * GET /api/chunks/[id]/model - Fetch GLB from S3 and serve to client
 *
 * This proxies S3 files through Next.js to avoid CORS issues
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { getChunkById } from '../../../../lib/chunkService';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { id } = req.query;

  if (typeof id !== 'string') {
    return res.status(400).json({ error: 'Invalid chunk ID' });
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get chunk from MongoDB to retrieve S3 URL
    const chunk = await getChunkById(id);

    if (!chunk) {
      return res.status(404).json({ error: 'Chunk not found' });
    }

    // Fast path: redirect to CDN URL to avoid proxying large bodies through Next API
    // Keeps response tiny (<1KB), leverages CDN caching, and bypasses Next's 4MB limit
    console.log(`[model-proxy] Redirecting to CDN: ${chunk.modelUrl}`);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Location', chunk.modelUrl);
    // 307 preserves method; 302 would also work for GET
    res.status(307).end();
  } catch (error) {
    console.error('[model-proxy] Error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to fetch model',
    });
  }
}
