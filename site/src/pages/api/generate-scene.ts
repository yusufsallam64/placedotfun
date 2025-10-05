import type { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import os from 'os';
import { imageToGLB } from '@/lib/zoedepth';
import { makePanoramic } from '@/lib/gemini';
import { generateRoomPrompt, type RoomContext } from '@/lib/prompts';
import { saveChunk } from '@/lib/chunkService';

const MAX_RETRIES = 3;
const RETRY_DELAY = 2000; // 2 seconds

// Increase body size limit to 50MB to handle base64 images
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '50mb',
    },
  },
};

interface GenerateSceneResponse {
  success: boolean;
  modelUrl?: string;
  chunkId?: string;
  error?: string;
  retries?: number;
}

interface RoomMetadata {
  x: number;
  y: number;
  context: RoomContext;
  prompt: string;
}

// Store room metadata in memory (could be persisted to file/db for production)
const roomMetadataStore = new Map<string, RoomMetadata>();

function getRoomKey(x: number, y: number): string {
  return `${x},${y}`;
}

function getPreviousRoomContext(x: number, y: number): RoomContext | undefined {
  // Check adjacent rooms (prioritize the one the user likely came from)
  const adjacentPositions = [
    { x: x - 1, y }, // left
    { x: x + 1, y }, // right
    { x, y: y - 1 }, // down
    { x, y: y + 1 }, // up
  ];

  // Find the first adjacent room that exists
  for (const pos of adjacentPositions) {
    const metadata = roomMetadataStore.get(getRoomKey(pos.x, pos.y));
    if (metadata) {
      return metadata.context;
    }
  }

  return undefined;
}

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function generateSceneWithRetry(
  x: number,
  y: number,
  userPrompt?: string,
  referenceImageBase64?: string,
  retryCount: number = 0
): Promise<{ modelUrl: string; chunkId: string; retries: number }> {
  const tempFiles: string[] = [];

  try {
    console.log(`[generate-scene] Starting generation for position (${x}, ${y}), attempt ${retryCount + 1}`);

    // Get context from adjacent rooms for continuity
    const previousContext = getPreviousRoomContext(x, y);
    if (previousContext) {
      console.log(`[generate-scene] Found previous room context, maintaining continuity`);
    } else {
      console.log(`[generate-scene] No previous context, generating fresh room`);
    }

    // Generate varied prompt for Gemini with optional continuity
    let prompt = generateRoomPrompt(previousContext);

    // If user provided a custom prompt, integrate it
    if (userPrompt && userPrompt.trim()) {
      console.log(`[generate-scene] User custom prompt: "${userPrompt}"`);
      // Combine the structured prompt with user's creative input
      prompt = `Generate a wide 16:9 aspect ratio seamless spherical panoramic image (360° equirectangular format). ${userPrompt.trim()}. Ensure the image wraps seamlessly at the edges for a continuous 360° view.`;
    }

    console.log(`[generate-scene] Final prompt:`, prompt);

    // Step 1: Generate panorama from Gemini
    const tempDir = os.tmpdir();
    console.log(`[generate-scene] Calling Gemini to generate panorama...`);

    // Handle reference image if provided
    let referenceImagePath: string | undefined;
    if (referenceImageBase64) {
      try {
        console.log(`[generate-scene] Processing reference image... (length: ${referenceImageBase64.length})`);
        
        // Extract base64 data (remove data:image/xxx;base64, prefix if present)
        const base64Match = referenceImageBase64.match(/^data:image\/(\w+);base64,(.+)$/);
        let base64Data: string;
        let extension: string;
        
        if (base64Match) {
          extension = base64Match[1];
          base64Data = base64Match[2];
          console.log(`[generate-scene] Detected image format: ${extension}`);
        } else {
          // Assume it's already just base64 without prefix
          base64Data = referenceImageBase64;
          extension = 'jpg';
          console.log(`[generate-scene] No data URI prefix found, assuming raw base64`);
        }
        
        // Decode base64
        const imageBuffer = Buffer.from(base64Data, 'base64');
        console.log(`[generate-scene] Decoded image buffer size: ${imageBuffer.length} bytes`);
        
        // Save to temp file
        referenceImagePath = `${tempDir}/ref_${Date.now()}.${extension}`;
        fs.writeFileSync(referenceImagePath, imageBuffer);
        tempFiles.push(referenceImagePath);
        console.log(`[generate-scene] Reference image saved to:`, referenceImagePath);
      } catch (imageError) {
        console.error(`[generate-scene] Failed to process reference image:`, imageError);
        throw new Error(`Failed to process reference image: ${imageError instanceof Error ? imageError.message : 'Unknown error'}`);
      }
    }

    const panoramicResult = await makePanoramic(tempDir, referenceImagePath, prompt);
    tempFiles.push(panoramicResult.filePath);
    console.log(`[generate-scene] Panorama generated:`, panoramicResult.filePath);

    // Step 2: Convert panorama to 3D GLB using ZoeDepth
    console.log(`[generate-scene] Converting panorama to 3D...`);
    const glbResult = await imageToGLB(
      panoramicResult.filePath,
      `panorama_${x}_${y}.jpg`,
      'image/jpeg',
      {
        maxResolution: 2048,
        smoothDepth: true,
        smoothSigma: 0.5,
        removeEdges: false,
        edgeThreshold: 0.15,
      }
    );

    // Step 3: Upload to S3 and save to MongoDB
    console.log(`[generate-scene] Uploading to S3 and saving to database...`);
    const chunkId = await saveChunk(
      { x, z: y }, // Map y coordinate to z for chunk system
      glbResult.buffer,
      {
        vertices: Number(glbResult.metadata.vertices) || 0,
        faces: Number(glbResult.metadata.faces) || 0,
        sourceImage: `generated_panorama_${x}_${y}.jpg`,
        generatedBy: 'ai',
      }
    );
    console.log(`[generate-scene] ✅ Saved to database with ID:`, chunkId);

    // Store room metadata for future continuity
    const roomContext: RoomContext = {
      theme: prompt.includes('living room') ? 'living room' :
             prompt.includes('bedroom') ? 'bedroom' :
             prompt.includes('kitchen') ? 'kitchen' : 'generic room',
      atmosphere: prompt.includes('warm') ? 'warm' :
                  prompt.includes('bright') ? 'bright' : 'ambient',
      style: 'photorealistic',
      description: prompt,
    };

    roomMetadataStore.set(getRoomKey(x, y), {
      x,
      y,
      context: roomContext,
      prompt,
    });

    console.log(`[generate-scene] Stored metadata for room (${x}, ${y})`);

    // Return proxy URL instead of direct S3 URL to avoid CORS issues
    return {
      modelUrl: `/api/chunks/${chunkId}/model`,
      chunkId,
      retries: retryCount
    };

  } catch (error) {
    console.error(`[generate-scene] Error on attempt ${retryCount + 1}:`, error);

    // Retry logic
    if (retryCount < MAX_RETRIES - 1) {
      console.log(`[generate-scene] Retrying in ${RETRY_DELAY}ms...`);
      await delay(RETRY_DELAY);
      return generateSceneWithRetry(x, y, userPrompt, referenceImageBase64, retryCount + 1);
    }

    throw error;
  } finally {
    // Cleanup temp files
    for (const tempFile of tempFiles) {
      try {
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
        }
      } catch (err) {
        console.error('[generate-scene] Error cleaning up temp file:', err);
      }
    }
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GenerateSceneResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { x, y, userPrompt, referenceImage } = req.body;

  // Validate coordinates
  if (typeof x !== 'number' || typeof y !== 'number') {
    return res.status(400).json({
      success: false,
      error: 'Invalid coordinates. x and y must be numbers.',
    });
  }

  // Validate userPrompt if provided
  if (userPrompt !== undefined && typeof userPrompt !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'Invalid userPrompt. Must be a string.',
    });
  }

  // Validate referenceImage if provided
  if (referenceImage !== undefined && typeof referenceImage !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'Invalid referenceImage. Must be a base64 string.',
    });
  }

  try {
    const { modelUrl, chunkId, retries } = await generateSceneWithRetry(x, y, userPrompt, referenceImage);

    res.status(200).json({
      success: true,
      modelUrl,
      chunkId,
      retries,
    });
  } catch (error) {
    console.error('[generate-scene] Failed after all retries:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate scene after multiple attempts',
      retries: MAX_RETRIES,
    });
  }
}
