/**
 * API endpoint for individual chunk
 * GET /api/chunks/[id] - Get chunk metadata
 * DELETE /api/chunks/[id] - Delete chunk
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { getChunkById, deleteChunk } from '../../../../lib/chunkService';
import { ChunkDTO } from '../../../../types/chunk';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { id } = req.query;

  if (typeof id !== 'string') {
    return res.status(400).json({ error: 'Invalid chunk ID' });
  }

  if (req.method === 'GET') {
    return handleGetChunk(id, req, res);
  } else if (req.method === 'DELETE') {
    return handleDeleteChunk(id, req, res);
  } else {
    return res.status(405).json({ error: 'Method not allowed' });
  }
}

/**
 * GET /api/chunks/[id]
 * Get chunk metadata
 */
async function handleGetChunk(
  id: string,
  req: NextApiRequest,
  res: NextApiResponse<ChunkDTO | { error: string }>
) {
  try {
    const chunk = await getChunkById(id);

    if (!chunk) {
      return res.status(404).json({ error: 'Chunk not found' });
    }

    const dto: ChunkDTO = {
      _id: chunk._id!.toString(),
      position: chunk.position,
      modelUrl: `/api/chunks/${chunk._id!.toString()}/model`,  // Proxy URL to avoid CORS
      metadata: {
        vertices: chunk.metadata.vertices,
        faces: chunk.metadata.faces,
        createdAt: chunk.metadata.createdAt.toISOString(),
        updatedAt: chunk.metadata.updatedAt.toISOString(),
        sourceImage: chunk.metadata.sourceImage,
        generatedBy: chunk.metadata.generatedBy,
      },
      neighbors: chunk.neighbors,
    };

    res.status(200).json(dto);
  } catch (error) {
    console.error('Error fetching chunk:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to fetch chunk',
    });
  }
}

/**
 * DELETE /api/chunks/[id]
 * Delete a chunk
 */
async function handleDeleteChunk(
  id: string,
  req: NextApiRequest,
  res: NextApiResponse<{ success: boolean } | { error: string }>
) {
  try {
    const success = await deleteChunk(id);

    if (!success) {
      return res.status(404).json({ error: 'Chunk not found' });
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error deleting chunk:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to delete chunk',
    });
  }
}
