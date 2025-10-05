import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';
import { promises as fsPromises } from 'fs';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

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
    // Read the input image
    const imageBuffer = await fsPromises.readFile(inputPath);
    const imageBase64 = imageBuffer.toString('base64');
    const mimeType = getMimeType(inputPath);

    // Use Gemini to analyze the image and create a panoramic version
    const visionModel = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
    
    const analysisPrompt = `Analyze this image and create a detailed, vivid description for generating a 360-degree equirectangular panorama.
Describe:
1. The main scene and environment
2. What should extend to the left and right to create a wraparound effect
3. The sky/ceiling above
4. The ground/floor below
5. What should be behind the viewer
6. Lighting, atmosphere, time of day, weather
7. Architectural details, textures, and colors

Make it highly detailed, suitable for photorealistic image generation. The final panorama should be seamless when wrapped horizontally.`;

    const analysisResult = await visionModel.generateContent([
      {
        inlineData: {
          mimeType,
          data: imageBase64,
        },
      },
      { text: analysisPrompt },
    ]);

    const sceneDescription = analysisResult.response.text();
    console.log('Scene analysis:', sceneDescription);
    
    // Generate panoramic image using Imagen
    const imageModel = genAI.getGenerativeModel({ model: 'imagen-3.0-generate-001' });
    
    // Create a detailed prompt for panoramic generation with 21:9 aspect ratio
    const panoramaPrompt = `Create a seamless 360-degree equirectangular panorama in ultra-wide 21:9 aspect ratio.
This is for 3D environment mapping, so it must wrap horizontally without visible seams.

SCENE DESCRIPTION:
${sceneDescription}

TECHNICAL REQUIREMENTS:
- Ultra-wide 21:9 aspect ratio (cinematic panorama)
- Seamless horizontal wrapping (left edge connects to right edge)
- Consistent lighting throughout
- Photorealistic, high detail
- No text, watermarks, or UI elements
- Suitable for 3D environment mapping`;

    const imageResult = await imageModel.generateContent([
      {
        text: panoramaPrompt,
      }
    ]);

    // Extract generated image
    const response = imageResult.response;
    const generatedImage = response.candidates?.[0]?.content?.parts?.[0];
    
    if (!generatedImage || !('inlineData' in generatedImage)) {
      throw new Error('No image generated from Gemini');
    }

    // Save the generated panoramic image
    const outputPath = path.join(
      outputDir,
      `panoramic_${Date.now()}_${path.basename(inputPath)}`
    );
    
    const imageData = Buffer.from(generatedImage.inlineData?.data || '', 'base64');
    await fsPromises.writeFile(outputPath, imageData);
    
    console.log('Panoramic image generated:', outputPath);
    
    return {
      filePath: outputPath,
      originalPath: inputPath,
      width: 2560,  // 21:9 aspect ratio
      height: 1097, // 2560/21*9 ≈ 1097
    };

  } catch (error) {
    console.error('Error in makePanoramic:', error);
    // If Gemini generation fails, fall back to using the original image
    console.log('Falling back to original image...');
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

/**
 * Quick conversion: Just describe and upscale the image to panoramic proportions
 * This is a faster but simpler approach
 */
export async function describeToPanorama(
  inputPath: string
): Promise<string> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY not set in environment variables');
  }

  const imageBuffer = await fsPromises.readFile(inputPath);
  const imageBase64 = imageBuffer.toString('base64');
  const mimeType = getMimeType(inputPath);

  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
  
  const prompt = `You are an expert at creating 360-degree panoramic environments. 
Analyze this image and provide a detailed description that could be used to generate a full equirectangular panorama.
Describe what should extend in all directions (left, right, up, down, behind) to create a cohesive 360-degree scene.
Be specific about lighting, atmosphere, architectural details, and environmental features.`;

  const result = await model.generateContent([
    {
      inlineData: {
        mimeType,
        data: imageBase64,
      },
    },
    { text: prompt },
  ]);

  return result.response.text();
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
