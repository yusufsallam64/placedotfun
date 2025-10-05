/**
 * S3 utility for uploading GLB files to DigitalOcean Spaces
 */
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

if (!process.env.S3_BUCKET_NAME) {
  throw new Error('S3_BUCKET_NAME is not set');
}

if (!process.env.S3_ACCESS_KEY || !process.env.S3_SECRET) {
  throw new Error('S3 access credentials (S3_ACCESS_KEY, S3_SECRET) are not set');
}

const s3Client = new S3Client({
  region: 'us-east-1',
  endpoint: 'https://nyc3.digitaloceanspaces.com',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY,
    secretAccessKey: process.env.S3_SECRET,
  },
  forcePathStyle: false,
});

const CDN_BASE_URL = 'https://peekd.nyc3.cdn.digitaloceanspaces.com';

/**
 * Upload a GLB file to S3 and return the CDN URL
 */
export async function uploadGLBToS3(
  fileBuffer: Buffer,
  chunkX: number,
  chunkZ: number
): Promise<string> {
  const fileName = `chunks/scene-${chunkX}-${chunkZ}.glb`;

  const uploadParams = {
    Bucket: process.env.S3_BUCKET_NAME!,
    Key: fileName,
    Body: fileBuffer,
    ContentType: 'model/gltf-binary',
    ACL: 'public-read' as const,
  };

  try {
    await s3Client.send(new PutObjectCommand(uploadParams));
    const url = `${CDN_BASE_URL}/${fileName}`;
    console.log(`✅ Uploaded GLB to S3: ${url}`);
    return url;
  } catch (error: unknown) {
    console.error('S3 upload error:', {
      message: (error as Error).message,
      fileName,
    });
    throw new Error(`Failed to upload GLB to S3: ${(error as Error).message}`);
  }
}
