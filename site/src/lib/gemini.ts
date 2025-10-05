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
 * OR generate a panoramic image from a text prompt
 *
 * If inputPath is provided: uses Gemini's vision capabilities to analyze the image
 * and create a panoramic version.
 *
 * If inputPath is not provided: generates a completely new panoramic image from the prompt.
 */
export async function makePanoramic(
  outputDir: string,
  inputPath?: string,
  userPrompt?: string
): Promise<PanoramicConversionResult> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY not set in environment variables');
  }

  try {
    // Initialize the AI client with explicit API key
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });

    console.log('[makePanoramic] Generating panoramic image...');

    let prompt: string;
    let contents: any[];

    // Mode 1: Generate from input image
    if (inputPath) {
      const imageBuffer = await fsPromises.readFile(inputPath);
      const imageBase64 = imageBuffer.toString('base64');
      const mimeType = getMimeType(inputPath);

      // Simple, direct prompt with image
      prompt = 'Generate a seamless 360 degree spherical panoramic image from this. Preserve lighting and elements from this image.';

      // Add user's custom prompt if provided
      if (userPrompt && userPrompt.trim()) {
        prompt += ` ${userPrompt.trim()}`;
        console.log('[makePanoramic] User prompt added:', userPrompt);
      }

      contents = [
        { text: prompt },
        { inlineData: { mimeType, data: imageBase64 } },
      ];
    }
    // Mode 2: Generate from text prompt only
    else {
      if (!userPrompt || !userPrompt.trim()) {
        throw new Error('Either inputPath or userPrompt must be provided');
      }

      prompt = userPrompt.trim();
      console.log('[makePanoramic] Generating from prompt:', prompt);

      contents = [{ text: prompt }];
    }

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image-preview',
      contents,
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

      const retryPrompt = inputPath
        ? 'Generate a seamless 360 degree spherical panoramic image from this. Preserve lighting and elements. Return ONLY the image, no text.'
        : `${prompt} Return ONLY the image, no text.`;

      const retryContents = inputPath
        ? [
            { text: retryPrompt },
            { inlineData: { mimeType: getMimeType(inputPath), data: (await fsPromises.readFile(inputPath)).toString('base64') } },
          ]
        : [{ text: retryPrompt }];

      const retryResp = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image-preview',
        contents: retryContents,
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
    const outputFilename = inputPath
      ? `panoramic_${Date.now()}_${path.basename(inputPath)}`
      : `generated_panorama_${Date.now()}.jpg`;

    const outputPath = path.join(outputDir, outputFilename);
    
    const imageData = Buffer.from(generatedImage.inlineData.data, 'base64');
    await fsPromises.writeFile(outputPath, imageData);
    
    console.log('[makePanoramic] Panoramic image saved:', outputPath, 'size:', imageData.length);

    return {
      filePath: outputPath,
      originalPath: inputPath || '',
      width: 2560,
      height: 1097,
    };

  } catch (error) {
    console.error('[makePanoramic] Error:', error);
    console.error('[makePanoramic] Full error details:', JSON.stringify(error, null, 2));

    // If Gemini generation fails and we have an input image, fall back to using it
    if (inputPath) {
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

    // No fallback for prompt-only generation
    throw error;
  }
}


/**
 * Generate a panoramic image from a text prompt using Gemini
 *
 * This creates a completely new panoramic image without requiring an input image.
 */
export async function generatePanoramicFromPrompt(
  prompt: string,
  outputDir: string
): Promise<PanoramicConversionResult> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY not set in environment variables');
  }

  try {
    // Initialize the AI client
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });

    console.log('[generatePanoramicFromPrompt] Generating panoramic image with prompt:', prompt);

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image-preview',
      contents: [
        { text: prompt },
      ],
    });

    console.log('[generatePanoramicFromPrompt] Response candidates:', response.candidates?.length ?? 0);

    // Extract the generated image
    const parts = response.candidates?.[0]?.content?.parts ?? [];
    let generatedImage: any = null;

    for (const part of parts) {
      if (part.inlineData?.data) {
        generatedImage = part;
        break;
      }
    }

    // Retry if no image
    if (!generatedImage) {
      console.log('[generatePanoramicFromPrompt] No image on first attempt, retrying...');

      const retryPrompt = `${prompt} Return ONLY the image, no text.`;

      const retryResp = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image-preview',
        contents: [
          { text: retryPrompt },
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
      `generated_panorama_${Date.now()}.jpg`
    );

    const imageData = Buffer.from(generatedImage.inlineData.data, 'base64');
    await fsPromises.writeFile(outputPath, imageData);

    console.log('[generatePanoramicFromPrompt] Panoramic image saved:', outputPath, 'size:', imageData.length);

    return {
      filePath: outputPath,
      originalPath: '',
      width: 2560,
      height: 1280,
    };

  } catch (error) {
    console.error('[generatePanoramicFromPrompt] Error:', error);
    console.error('[generatePanoramicFromPrompt] Full error details:', JSON.stringify(error, null, 2));
    throw error;
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
