/**
 * Chunk data structure for persistent world
 */
import { ObjectId } from 'mongodb';

export interface ChunkPosition {
  x: number;
  z: number;
}

export interface ChunkNeighbors {
  north?: string;  // ObjectId as string
  south?: string;
  east?: string;
  west?: string;
}

export interface ChunkMetadata {
  vertices: number;
  faces: number;
  createdAt: Date;
  updatedAt: Date;
  sourceImage?: string;  // Original image filename
  generatedBy?: string;  // User ID or identifier
}

export interface Chunk {
  _id?: ObjectId;
  position: ChunkPosition;
  modelUrl: string;  // S3 URL to GLB file
  metadata: ChunkMetadata;
  neighbors?: ChunkNeighbors;
}

export interface ChunkDTO {
  _id: string;
  position: ChunkPosition;
  modelUrl: string;  // URL to fetch the model
  metadata: Omit<ChunkMetadata, 'createdAt' | 'updatedAt'> & {
    createdAt: string;
    updatedAt: string;
  };
  neighbors?: ChunkNeighbors;
}

/**
 * Convert chunk position to string key
 */
export function getChunkKey(position: ChunkPosition): string {
  return `${position.x},${position.z}`;
}

/**
 * Get neighboring chunk positions
 */
export function getNeighborPositions(position: ChunkPosition): {
  north: ChunkPosition;
  south: ChunkPosition;
  east: ChunkPosition;
  west: ChunkPosition;
} {
  return {
    north: { x: position.x, z: position.z + 1 },
    south: { x: position.x, z: position.z - 1 },
    east: { x: position.x + 1, z: position.z },
    west: { x: position.x - 1, z: position.z },
  };
}
