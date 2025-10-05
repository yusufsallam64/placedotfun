import type { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { imageToGLB } from '@/lib/zoedepth';
import { makePanoramic } from '@/lib/gemini';
import { generateRoomPrompt, type RoomContext } from '@/lib/prompts';

const MAX_RETRIES = 3;
const RETRY_DELAY = 2000; // 2 seconds

interface GenerateSceneResponse {
  success: boolean;
  filename?: string;
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
  retryCount: number = 0
): Promise<{ filename: string; retries: number }> {
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

    const panoramicResult = await makePanoramic(tempDir, undefined, prompt);
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

    // Step 3: Save GLB to public folder
    const filename = `scene-${x}-${y}.glb`;
    const publicDir = path.join(process.cwd(), 'public');
    const outputPath = path.join(publicDir, filename);

    fs.writeFileSync(outputPath, glbResult.buffer);
    console.log(`[generate-scene] GLB saved to:`, outputPath);

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

    return { filename, retries: retryCount };

  } catch (error) {
    console.error(`[generate-scene] Error on attempt ${retryCount + 1}:`, error);

    // Retry logic
    if (retryCount < MAX_RETRIES - 1) {
      console.log(`[generate-scene] Retrying in ${RETRY_DELAY}ms...`);
      await delay(RETRY_DELAY);
      return generateSceneWithRetry(x, y, userPrompt, retryCount + 1);
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

  const { x, y, userPrompt } = req.body;

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

  try {
    const { filename, retries } = await generateSceneWithRetry(x, y, userPrompt);

    res.status(200).json({
      success: true,
      filename,
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
