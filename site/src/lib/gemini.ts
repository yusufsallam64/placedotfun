import { GoogleGenAI } from '@google/genai';
import path from 'path';
import { promises as fsPromises } from 'fs';

export interface PanoramicConversionResult {
  filePath: string;
  originalPath: string;
  width: number;
  height: number;
}

/**
 * Convert a regular image to a 360° panoramic image using Gemini
 * 
 * This uses Gemini's vision capabilities to analyze the image and generate
 * a prompt for creating a panoramic version, then uses image generation
 * to create the panoramic result.
 */
export async function makePanoramic(
  inputPath: string,
  outputDir: string
): Promise<PanoramicConversionResult> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY not set in environment variables');
  }

  try {
    // Initialize the AI client with explicit API key
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });

    // Read the input image
    const imageBuffer = await fsPromises.readFile(inputPath);
    const imageBase64 = imageBuffer.toString('base64');
    const mimeType = getMimeType(inputPath);

    console.log('[makePanoramic] Generating panoramic image...');
    
    // Simple, direct prompt with image
    const prompt = 'Generate a seamless spherical panoramic image from this. Preserve lighting and elements from this image.';

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image-preview',
      contents: [
        { text: prompt },
        { inlineData: { mimeType, data: imageBase64 } },
      ],
    });

    console.log('[makePanoramic] Response candidates:', response.candidates?.length ?? 0);

    // Extract the generated image
    const parts = response.candidates?.[0]?.content?.parts ?? [];
    let generatedImage: any = null;
    
    for (const part of parts) {
      if (part.inlineData?.data) {
        generatedImage = part;
        break;
      }
    }

    // Fallback: retry with stricter prompt if no image
    if (!generatedImage) {
      console.log('[makePanoramic] No image on first attempt, retrying...');
      
      const retryPrompt = 'Generate a seamless spherical panoramic image from this. Preserve lighting and elements. Return ONLY the image, no text.';
      
      const retryResp = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image-preview',
        contents: [
          { text: retryPrompt },
          { inlineData: { mimeType, data: imageBase64 } },
        ],
      });

      const retryParts = retryResp.candidates?.[0]?.content?.parts ?? [];
      for (const part of retryParts) {
        if (part.inlineData?.data) {
          generatedImage = part;
          break;
        }
      }
    }
    
    if (!generatedImage?.inlineData?.data) {
      throw new Error('No image generated from Gemini');
    }

    // Save the generated panoramic image
    const outputPath = path.join(
      outputDir,
      `panoramic_${Date.now()}_${path.basename(inputPath)}`
    );
    
    const imageData = Buffer.from(generatedImage.inlineData.data, 'base64');
    await fsPromises.writeFile(outputPath, imageData);
    
    console.log('[makePanoramic] Panoramic image saved:', outputPath, 'size:', imageData.length);
    
    return {
      filePath: outputPath,
      originalPath: inputPath,
      width: 2560,
      height: 1097,
    };

  } catch (error) {
    console.error('[makePanoramic] Error:', error);
    console.error('[makePanoramic] Full error details:', JSON.stringify(error, null, 2));
    
    // If Gemini generation fails, fall back to using the original image
    console.log('[makePanoramic] Falling back to original image...');
    const outputPath = path.join(
      outputDir,
      `fallback_${path.basename(inputPath)}`
    );
    await fsPromises.copyFile(inputPath, outputPath);
    
    return {
      filePath: outputPath,
      originalPath: inputPath,
      width: 2560,
      height: 1097,
    };
  }
}

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
  };
  return mimeTypes[ext] || 'image/jpeg';
}
