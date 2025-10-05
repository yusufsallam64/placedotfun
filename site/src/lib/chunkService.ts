/**
 * Chunk service for managing persistent world chunks
 */
import { ObjectId } from 'mongodb';
import { getCollection } from './mongodb';
import { uploadGLBToS3 } from './s3';
import {
  Chunk,
  ChunkDTO,
  ChunkPosition,
  ChunkMetadata,
  getChunkKey,
  getNeighborPositions,
} from '../types/chunk';

const CHUNKS_COLLECTION = 'chunks';

/**
 * Save a new chunk to the database
 * Uploads GLB to S3 and stores the URL in MongoDB
 */
export async function saveChunk(
  position: ChunkPosition,
  modelData: Buffer,
  metadata: Omit<ChunkMetadata, 'createdAt' | 'updatedAt'>
): Promise<string> {
  const collection = await getCollection<Chunk>(CHUNKS_COLLECTION);

  // Upload GLB to S3
  const modelUrl = await uploadGLBToS3(modelData, position.x, position.z);

  // Check if chunk already exists at this position
  const existing = await collection.findOne({ 'position.x': position.x, 'position.z': position.z });

  if (existing) {
    // Update existing chunk
    await collection.updateOne(
      { _id: existing._id },
      {
        $set: {
          modelUrl,
          metadata: {
            ...metadata,
            createdAt: existing.metadata.createdAt,
            updatedAt: new Date(),
          },
        },
      }
    );
    return existing._id.toString();
  }

  // Create new chunk
  const chunk: Chunk = {
    position,
    modelUrl,
    metadata: {
      ...metadata,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  };

  const result = await collection.insertOne(chunk);

  // Update neighbors
  await updateNeighborReferences(result.insertedId.toString(), position);

  return result.insertedId.toString();
}

/**
 * Get a chunk by position
 */
export async function getChunk(position: ChunkPosition): Promise<Chunk | null> {
  const collection = await getCollection<Chunk>(CHUNKS_COLLECTION);
  return collection.findOne({ 'position.x': position.x, 'position.z': position.z });
}

/**
 * Get chunk by ID
 */
export async function getChunkById(id: string): Promise<Chunk | null> {
  const collection = await getCollection<Chunk>(CHUNKS_COLLECTION);
  return collection.findOne({ _id: new ObjectId(id) });
}

/**
 * Get chunks in a radius around a position
 */
export async function getChunksInRadius(
  center: ChunkPosition,
  radius: number = 1
): Promise<Chunk[]> {
  const collection = await getCollection<Chunk>(CHUNKS_COLLECTION);
  
  return collection.find({
    'position.x': { $gte: center.x - radius, $lte: center.x + radius },
    'position.z': { $gte: center.z - radius, $lte: center.z + radius },
  }).toArray();
}

/**
 * Get all chunks (for world view)
 */
export async function getAllChunks(limit: number = 100): Promise<ChunkDTO[]> {
  const collection = await getCollection<Chunk>(CHUNKS_COLLECTION);

  const chunks = await collection
    .find({})
    .sort({ 'metadata.createdAt': -1 })
    .limit(limit)
    .toArray();

  return chunks.map(chunk => ({
    _id: chunk._id!.toString(),
    position: chunk.position,
    modelUrl: `/api/chunks/${chunk._id!.toString()}/model`,  // Proxy URL to avoid CORS
    metadata: {
      vertices: chunk.metadata.vertices,
      faces: chunk.metadata.faces,
      createdAt: chunk.metadata.createdAt.toISOString(),
      updatedAt: chunk.metadata.updatedAt.toISOString(),
      sourceImage: chunk.metadata.sourceImage,
      generatedBy: chunk.metadata.generatedBy,
    },
    neighbors: chunk.neighbors,
  }));
}

/**
 * Delete a chunk
 */
export async function deleteChunk(id: string): Promise<boolean> {
  const collection = await getCollection<Chunk>(CHUNKS_COLLECTION);
  const result = await collection.deleteOne({ _id: new ObjectId(id) });
  return result.deletedCount > 0;
}

/**
 * Update neighbor references when a new chunk is added
 */
async function updateNeighborReferences(
  chunkId: string,
  position: ChunkPosition
): Promise<void> {
  const collection = await getCollection<Chunk>(CHUNKS_COLLECTION);
  const neighbors = getNeighborPositions(position);

  // Find all neighboring chunks
  const neighborChunks = await collection.find({
    $or: [
      { 'position.x': neighbors.north.x, 'position.z': neighbors.north.z },
      { 'position.x': neighbors.south.x, 'position.z': neighbors.south.z },
      { 'position.x': neighbors.east.x, 'position.z': neighbors.east.z },
      { 'position.x': neighbors.west.x, 'position.z': neighbors.west.z },
    ],
  }).toArray();

  // Update each neighbor to point back to this chunk
  for (const neighbor of neighborChunks) {
    const updates: any = {};
    
    if (neighbor.position.x === neighbors.north.x && neighbor.position.z === neighbors.north.z) {
      updates['neighbors.south'] = chunkId;
    } else if (neighbor.position.x === neighbors.south.x && neighbor.position.z === neighbors.south.z) {
      updates['neighbors.north'] = chunkId;
    } else if (neighbor.position.x === neighbors.east.x && neighbor.position.z === neighbors.east.z) {
      updates['neighbors.west'] = chunkId;
    } else if (neighbor.position.x === neighbors.west.x && neighbor.position.z === neighbors.west.z) {
      updates['neighbors.east'] = chunkId;
    }

    if (Object.keys(updates).length > 0) {
      await collection.updateOne({ _id: neighbor._id }, { $set: updates });
    }
  }

  // Update the new chunk with its neighbors
  const neighborUpdates: any = {};
  for (const neighbor of neighborChunks) {
    if (neighbor.position.x === neighbors.north.x && neighbor.position.z === neighbors.north.z) {
      neighborUpdates['neighbors.north'] = neighbor._id!.toString();
    } else if (neighbor.position.x === neighbors.south.x && neighbor.position.z === neighbors.south.z) {
      neighborUpdates['neighbors.south'] = neighbor._id!.toString();
    } else if (neighbor.position.x === neighbors.east.x && neighbor.position.z === neighbors.east.z) {
      neighborUpdates['neighbors.east'] = neighbor._id!.toString();
    } else if (neighbor.position.x === neighbors.west.x && neighbor.position.z === neighbors.west.z) {
      neighborUpdates['neighbors.west'] = neighbor._id!.toString();
    }
  }

  if (Object.keys(neighborUpdates).length > 0) {
    await collection.updateOne({ _id: new ObjectId(chunkId) }, { $set: neighborUpdates });
  }
}

/**
 * Get chunk statistics
 */
export async function getChunkStats() {
  const collection = await getCollection<Chunk>(CHUNKS_COLLECTION);
  
  const total = await collection.countDocuments();
  const totalVertices = await collection.aggregate([
    { $group: { _id: null, total: { $sum: '$metadata.vertices' } } }
  ]).toArray();
  const totalFaces = await collection.aggregate([
    { $group: { _id: null, total: { $sum: '$metadata.faces' } } }
  ]).toArray();

  return {
    totalChunks: total,
    totalVertices: totalVertices[0]?.total || 0,
    totalFaces: totalFaces[0]?.total || 0,
  };
}
