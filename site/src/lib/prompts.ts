/**
 * Generate varied prompts for creating diverse 3D spaces
 * Maintains cohesion while providing variety
 */

const roomThemes = [
  // Indoor spaces
  'a cozy living room with warm lighting and comfortable furniture',
  'a modern minimalist bedroom with clean lines and soft colors',
  'a rustic kitchen with wooden cabinets and natural materials',
  'a bright sunlit study room with bookshelves and a desk',
  'a spacious art studio with canvases and creative tools',
  'a peaceful meditation room with soft cushions and plants',
  'a vintage library with leather chairs and tall bookshelves',
  'a futuristic laboratory with sleek technology and blue lighting',

  // Transitional spaces
  'a welcoming entrance hall with decorative elements',
  'a cozy attic space with slanted ceiling and warm lighting',
  'a serene greenhouse filled with plants and natural light',
  'a charming conservatory with glass walls and greenery',

  // Atmospheric spaces
  'a mystical chamber with soft glowing lights and ancient artifacts',
  'a cyberpunk room with neon lights and technology',
  'a steampunk workshop with brass fixtures and mechanical elements',
  'a zen garden room with stones and minimal decoration',
  'a tropical paradise room with lush plants and warm ambiance',
  'a starlit observatory with telescopes and celestial views',

  // Cozy spaces
  'a warm fireplace room with comfortable seating',
  'a charming tea room with delicate furniture and soft lighting',
  'a peaceful reading nook with cushions and ambient light',
  'a serene spa room with candles and calming atmosphere',
];

const atmosphereModifiers = [
  'bathed in golden hour sunlight',
  'lit by soft ambient lighting',
  'illuminated by warm candlelight',
  'with natural daylight streaming through windows',
  'with a cozy and inviting atmosphere',
  'with a calm and peaceful ambiance',
  'with warm and welcoming vibes',
  'with soft ethereal lighting',
];

const styleModifiers = [
  'rendered in a photorealistic style',
  'with attention to interior design details',
  'featuring high-quality textures and materials',
  'with cohesive color palette',
  'showcasing carefully curated decor',
  'with balanced composition',
];

export function generateRoomPrompt(): string {
  const theme = roomThemes[Math.floor(Math.random() * roomThemes.length)];
  const atmosphere = atmosphereModifiers[Math.floor(Math.random() * atmosphereModifiers.length)];
  const style = styleModifiers[Math.floor(Math.random() * styleModifiers.length)];

  // Core panoramic prompt that must be preserved for format consistency
  const panoramicFormat = 'Generate a seamless spherical panoramic image (360° equirectangular format).';

  return `${panoramicFormat} ${theme}, ${atmosphere}, ${style}. Ensure the image wraps seamlessly at the edges for a continuous 360° view.`;
}

export function generateSceneDescription(): string {
  return roomThemes[Math.floor(Math.random() * roomThemes.length)];
}
