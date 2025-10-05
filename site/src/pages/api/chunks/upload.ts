/**
 * API endpoint to upload GLB files directly to S3 and MongoDB
 * POST /api/chunks/upload
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import formidable from 'formidable';
import fs from 'fs/promises';
import { saveChunk } from '../../../lib/chunkService';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let tempFilePath: string | null = null;

  try {
    // Parse form data
    const form = formidable({});
    const [fields, files] = await form.parse(req);

    // Get coordinates
    const xStr = Array.isArray(fields.x) ? fields.x[0] : fields.x;
    const zStr = Array.isArray(fields.z) ? fields.z[0] : fields.z;

    if (!xStr || !zStr) {
      return res.status(400).json({ error: 'Missing x or z coordinate' });
    }

    const x = parseInt(xStr);
    const z = parseInt(zStr);

    if (isNaN(x) || isNaN(z)) {
      return res.status(400).json({ error: 'Invalid coordinates' });
    }

    // Get uploaded file
    const fileArray = files.file;
    const file = Array.isArray(fileArray) ? fileArray[0] : fileArray;

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Validate it's a GLB file
    if (!file.originalFilename?.endsWith('.glb')) {
      return res.status(400).json({ error: 'Only GLB files are allowed' });
    }

    tempFilePath = file.filepath;

    // Read GLB file
    const fileData = await fs.readFile(file.filepath);

    console.log(`[upload] Uploading ${file.originalFilename} (${(fileData.length / 1024 / 1024).toFixed(1)}MB) to position (${x}, ${z})`);

    // Upload to S3 and save to MongoDB
    const chunkId = await saveChunk(
      { x, z },
      fileData,
      {
        vertices: 0, // Could parse from GLB if needed
        faces: 0,
        sourceImage: file.originalFilename || 'uploaded.glb',
        generatedBy: 'upload',
      }
    );

    console.log(`[upload] ✅ Successfully uploaded with ID: ${chunkId}`);

    res.status(200).json({
      success: true,
      chunkId,
      position: { x, z },
      filename: file.originalFilename,
      size: `${(fileData.length / 1024 / 1024).toFixed(1)}MB`,
    });
  } catch (error) {
    console.error('[upload] Error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Upload failed',
    });
  } finally {
    // Cleanup temp file
    if (tempFilePath) {
      try {
        await fs.unlink(tempFilePath);
      } catch (err) {
        console.error('[upload] Error cleaning up temp file:', err);
      }
    }
  }
}
