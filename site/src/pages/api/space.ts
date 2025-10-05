import type { NextApiRequest, NextApiResponse } from 'next';
import formidable from 'formidable';
import fs from 'fs';
import os from 'os';
import { imageToGLB, getDepthMap } from '@/lib/zoedepth';
import { makePanoramic } from '@/lib/gemini';
import { saveChunk } from '@/lib/chunkService';

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

  let tempFiles: string[] = [];

  try {
    // Parse form data
    const form = formidable({});
    const [fields, files] = await form.parse(req);
    
    const file = Array.isArray(files.file) ? files.file[0] : files.file;
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    tempFiles.push(file.filepath);

    const type = req.query.type as string || 'depth';
    const usePanorama = req.query.panorama === 'true';
    const userPrompt = req.query.prompt as string || '';
    const saveToWorld = req.query.saveToWorld === 'true';
    const chunkX = req.query.x ? parseInt(req.query.x as string) : 0;
    const chunkZ = req.query.z ? parseInt(req.query.z as string) : 0;

    if (type === 'panorama') {
      // Panorama Conversion Only
      console.log('Converting to panoramic...', userPrompt ? `with custom prompt: "${userPrompt}"` : '');
      const tempDir = os.tmpdir();

      try {
        const panoramicResult = await makePanoramic(tempDir, file.filepath, userPrompt);
        tempFiles.push(panoramicResult.filePath);
        
        // Read the panoramic image
        const imageBuffer = fs.readFileSync(panoramicResult.filePath);
        
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Content-Disposition', 'inline; filename=panoramic.jpg');
        res.setHeader('X-Width', panoramicResult.width.toString());
        res.setHeader('X-Height', panoramicResult.height.toString());
        res.send(imageBuffer);
      } catch (error) {
        console.error('Panoramic conversion failed:', error);
        throw new Error('Failed to convert to panoramic: ' + (error instanceof Error ? error.message : 'Unknown error'));
      }
      
    } else if (type === '3d' || type === 'space') {
      // 3D Space Generation
      let processPath = file.filepath;

      // If panorama flag is true, convert to panoramic first
      if (usePanorama) {
        console.log('Converting to panoramic...', userPrompt ? `with custom prompt: "${userPrompt}"` : '');
        const tempDir = os.tmpdir();

        try {
          const panoramicResult = await makePanoramic(tempDir, file.filepath, userPrompt);
          processPath = panoramicResult.filePath;
          tempFiles.push(processPath);
          console.log('Panoramic conversion complete');
        } catch (error) {
          console.warn('Panoramic conversion failed, using original:', error);
          // Continue with original image
        }
      }

      // Convert to 3D GLB
      const result = await imageToGLB(
        processPath,
        file.originalFilename || 'image.jpg',
        file.mimetype || 'image/jpeg',
        {
          maxResolution: 2048,
          smoothDepth: true,
          smoothSigma: 0.5,
          removeEdges: false,  // Disabled - was causing missing chunks
          edgeThreshold: 0.15,
        }
      );

      // Save to persistent world if requested
      let chunkId: string | undefined;
      if (saveToWorld) {
        try {
          console.log(`Saving chunk at position (${chunkX}, ${chunkZ})`);
          console.log(`Buffer size: ${result.buffer.length} bytes`);
          chunkId = await saveChunk(
            { x: chunkX, z: chunkZ },
            result.buffer,
            {
              vertices: result.metadata.vertices || 0,
              faces: result.metadata.faces || 0,
              sourceImage: file.originalFilename || 'unknown',
              generatedBy: 'user',
            }
          );
          console.log(`✅ Chunk saved successfully with ID: ${chunkId}`);
          res.setHeader('X-Chunk-Id', chunkId);
          res.setHeader('X-Chunk-X', chunkX.toString());
          res.setHeader('X-Chunk-Z', chunkZ.toString());
        } catch (error) {
          console.error('❌ Failed to save chunk to database:', error);
          console.error('Error details:', error instanceof Error ? error.stack : error);
          // Continue anyway - send the GLB even if save fails
        }
      }

      // Set response headers
      if (result.metadata.contentType) {
        res.setHeader('Content-Type', result.metadata.contentType);
      }
      if (result.metadata.contentDisposition) {
        res.setHeader('Content-Disposition', result.metadata.contentDisposition);
      }
      if (result.metadata.vertices) {
        res.setHeader('X-Vertices', result.metadata.vertices);
      }
      if (result.metadata.faces) {
        res.setHeader('X-Faces', result.metadata.faces);
      }

      res.send(result.buffer);

    } else if (type === 'depth') {
      // Depth Map Only
      const result = await getDepthMap(
        file.filepath,
        file.originalFilename || 'image.jpg',
        file.mimetype || 'image/jpeg',
        true
      );

      if (result.metadata.contentType) {
        res.setHeader('Content-Type', result.metadata.contentType);
      }
      if (result.metadata.contentDisposition) {
        res.setHeader('Content-Disposition', result.metadata.contentDisposition);
      }

      res.send(result.buffer);

    } else {
      return res.status(400).json({ error: 'Invalid type. Use: depth, 3d, or space' });
    }

  } catch (error) {
    console.error('API error:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Internal server error' 
    });
  } finally {
    // Cleanup temp files
    for (const tempFile of tempFiles) {
      try {
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
        }
      } catch (err) {
        console.error('Error cleaning up temp file:', err);
      }
    }
  }
}
