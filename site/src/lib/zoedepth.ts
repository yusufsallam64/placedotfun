import FormData from 'form-data';
import fs from 'fs';
import axios from 'axios';

const ZOEDEPTH_API = process.env.ZOEDEPTH_API_URL || 'http://localhost:8000';

export interface ZoeDepthOptions {
  maxResolution?: number;
  smoothDepth?: boolean;
  smoothSigma?: number;
  removeEdges?: boolean;
  edgeThreshold?: number;
}

export interface ZoeDepthResult {
  buffer: Buffer;
  metadata: {
    contentType: string | null;
    contentDisposition: string | null;
    vertices?: string | null;
    faces?: string | null;
  };
}

/**
 * Convert an image to a 3D GLB mesh using ZoeDepth
 */
export async function imageToGLB(
  filePath: string,
  filename: string,
  mimetype: string,
  options: ZoeDepthOptions = {}
): Promise<ZoeDepthResult> {
  const {
    maxResolution = 2048,
    smoothDepth = true,
    smoothSigma = 0.5,
    removeEdges = true,
    edgeThreshold = 0.03,
  } = options;

  console.log('imageToGLB called with:', { filePath, filename, mimetype, options });
  
  // Check if file exists
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  // Prepare form data
  const formData = new FormData();
  formData.append('file', fs.createReadStream(filePath), {
    filename,
    contentType: mimetype,
  });

  // Build query params
  const params = new URLSearchParams({
    format: 'glb',
    max_resolution: maxResolution.toString(),
    smooth_depth: smoothDepth.toString(),
    smooth_sigma: smoothSigma.toString(),
    remove_edges: removeEdges.toString(),
    edge_threshold: edgeThreshold.toString(),
  });

  const endpoint = `${ZOEDEPTH_API}/panorama-to-3d?${params}`;
  
  console.log('Calling endpoint:', endpoint);

  try {
    const response = await axios.post(endpoint, formData, {
      headers: formData.getHeaders(),
      responseType: 'arraybuffer',
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    const buffer = Buffer.from(response.data);
    
    return {
      buffer,
      metadata: {
        contentType: response.headers['content-type'] || null,
        contentDisposition: response.headers['content-disposition'] || null,
        vertices: response.headers['x-vertices'] || null,
        faces: response.headers['x-faces'] || null,
      },
    };
  } catch (error: any) {
    if (error.response) {
      const errorText = error.response.data?.toString() || error.message;
      console.error('ZoeDepth API error response:', errorText);
      throw new Error(`ZoeDepth API error: ${error.response.status} - ${errorText}`);
    }
    throw error;
  }
}

/**
 * Get depth map from an image using ZoeDepth
 */
export async function getDepthMap(
  filePath: string,
  filename: string,
  mimetype: string,
  returnVisualization: boolean = true
): Promise<ZoeDepthResult> {
  const formData = new FormData();
  formData.append('file', fs.createReadStream(filePath), {
    filename,
    contentType: mimetype,
  });

  const params = new URLSearchParams({
    return_visualization: returnVisualization.toString(),
  });

  const endpoint = `${ZOEDEPTH_API}/estimate-depth?${params}`;

  try {
    const response = await axios.post(endpoint, formData, {
      headers: formData.getHeaders(),
      responseType: 'arraybuffer',
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    const buffer = Buffer.from(response.data);
    
    return {
      buffer,
      metadata: {
        contentType: response.headers['content-type'] || null,
        contentDisposition: response.headers['content-disposition'] || null,
      },
    };
  } catch (error: any) {
    if (error.response) {
      const errorText = error.response.data?.toString() || error.message;
      console.error('ZoeDepth API error response:', errorText);
      throw new Error(`ZoeDepth API error: ${error.response.status} - ${errorText}`);
    }
    throw error;
  }
}
