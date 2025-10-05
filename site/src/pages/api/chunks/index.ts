/**
 * API endpoints for chunk management
 * GET /api/chunks - List all chunks
 * POST /api/chunks - Create a new chunk
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import formidable from 'formidable';
import fs from 'fs/promises';
import { saveChunk, getAllChunks } from '../../../lib/chunkService';
import { ChunkDTO } from '../../../types/chunk';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method === 'GET') {
    return handleGetChunks(req, res);
  } else if (req.method === 'POST') {
    return handleCreateChunk(req, res);
  } else {
    return res.status(405).json({ error: 'Method not allowed' });
  }
}

/**
 * GET /api/chunks
 * Get all chunks in the world
 */
async function handleGetChunks(
  req: NextApiRequest,
  res: NextApiResponse<ChunkDTO[] | { error: string }>
) {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const chunks = await getAllChunks(limit);
    
    res.status(200).json(chunks);
  } catch (error) {
    console.error('Error fetching chunks:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to fetch chunks',
    });
  }
}

/**
 * POST /api/chunks
 * Create a new chunk from uploaded GLB file
 * Body: FormData with:
 *   - file: GLB model file
 *   - x: chunk x position (integer)
 *   - z: chunk z position (integer)
 *   - vertices: number of vertices (optional)
 *   - faces: number of faces (optional)
 *   - sourceImage: original image filename (optional)
 */
async function handleCreateChunk(
  req: NextApiRequest,
  res: NextApiResponse<{ id: string; position: { x: number; z: number } } | { error: string }>
) {
  try {
    const form = formidable({ multiples: false });

    const [fields, files] = await form.parse(req);

    // Validate required fields
    const xStr = Array.isArray(fields.x) ? fields.x[0] : fields.x;
    const zStr = Array.isArray(fields.z) ? fields.z[0] : fields.z;

    if (!xStr || !zStr) {
      return res.status(400).json({ error: 'Missing x or z position' });
    }

    const x = parseInt(xStr);
    const z = parseInt(zStr);

    if (isNaN(x) || isNaN(z)) {
      return res.status(400).json({ error: 'Invalid x or z position' });
    }

    // Get uploaded file
    const fileArray = files.file;
    const file = Array.isArray(fileArray) ? fileArray[0] : fileArray;

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Read GLB file data
    const modelData = await fs.readFile(file.filepath);

    // Extract metadata
    const vertices = fields.vertices
      ? parseInt(Array.isArray(fields.vertices) ? fields.vertices[0] : fields.vertices)
      : 0;
    const faces = fields.faces
      ? parseInt(Array.isArray(fields.faces) ? fields.faces[0] : fields.faces)
      : 0;
    const sourceImage = fields.sourceImage
      ? (Array.isArray(fields.sourceImage) ? fields.sourceImage[0] : fields.sourceImage)
      : undefined;

    // Save chunk to database
    const chunkId = await saveChunk(
      { x, z },
      modelData,
      {
        vertices,
        faces,
        sourceImage,
        generatedBy: 'user', // Could be enhanced with auth
      }
    );

    // Clean up temp file
    await fs.unlink(file.filepath).catch(() => {});

    res.status(201).json({
      id: chunkId,
      position: { x, z },
    });
  } catch (error) {
    console.error('Error creating chunk:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to create chunk',
    });
  }
}
