import type { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { imageToGLB } from '@/lib/zoedepth';
import { makePanoramic } from '@/lib/gemini';
import { generateRoomPrompt } from '@/lib/prompts';

const MAX_RETRIES = 3;
const RETRY_DELAY = 2000; // 2 seconds

interface GenerateSceneResponse {
  success: boolean;
  filename?: string;
  error?: string;
  retries?: number;
}

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function generateSceneWithRetry(
  x: number,
  y: number,
  retryCount: number = 0
): Promise<{ filename: string; retries: number }> {
  const tempFiles: string[] = [];

  try {
    console.log(`[generate-scene] Starting generation for position (${x}, ${y}), attempt ${retryCount + 1}`);

    // Generate varied prompt for Gemini
    const prompt = generateRoomPrompt();
    console.log(`[generate-scene] Generated prompt:`, prompt);

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

    return { filename, retries: retryCount };

  } catch (error) {
    console.error(`[generate-scene] Error on attempt ${retryCount + 1}:`, error);

    // Retry logic
    if (retryCount < MAX_RETRIES - 1) {
      console.log(`[generate-scene] Retrying in ${RETRY_DELAY}ms...`);
      await delay(RETRY_DELAY);
      return generateSceneWithRetry(x, y, retryCount + 1);
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

  const { x, y } = req.body;

  // Validate coordinates
  if (typeof x !== 'number' || typeof y !== 'number') {
    return res.status(400).json({
      success: false,
      error: 'Invalid coordinates. x and y must be numbers.',
    });
  }

  try {
    const { filename, retries } = await generateSceneWithRetry(x, y);

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
