import Phaser from "phaser";

type FurniturePair = { x: number; y: number };

/**
 * The classroom artwork is a single baked PNG. These patches re-orient the
 * desk/chair groups without replacing the source artwork.
 */
const PAIRS: FurniturePair[] = [
  { x: 8.25, y: 3.85 },
  { x: 2.2, y: 6.35 },
  { x: 6.2, y: 6.35 },
  { x: 10.2, y: 6.35 },
  { x: 13.35, y: 6.35 },
  { x: 2.2, y: 9.15 },
  { x: 6.2, y: 9.15 },
  { x: 10.2, y: 9.15 },
  { x: 13.35, y: 9.15 },
];

const PATCH_WIDTH = 96;
const PATCH_HEIGHT = 144;
const FLOOR_TILE = { x: 4, y: 4, size: 48 };

export function applyClassroomFurnitureOrientation(
  scene: Phaser.Scene,
  textureKey: string,
  tileSize: number,
): void {
  const texture = scene.textures.get(textureKey);
  if (!texture) return;

  const source = texture.getSourceImage() as { width?: number; height?: number };
  const imageWidth = source.width ?? 0;
  const imageHeight = source.height ?? 0;
  if (!imageWidth || !imageHeight) return;

  for (const pair of PAIRS) {
    const centerX = Math.round(pair.x * tileSize);
    const centerY = Math.round(pair.y * tileSize);
    const left = centerX - PATCH_WIDTH / 2;
    const top = centerY - PATCH_HEIGHT / 2;
    const cropLeft = Math.max(0, Math.round(left));
    const cropTop = Math.max(0, Math.round(top));
    const cropRight = Math.min(imageWidth, Math.round(left + PATCH_WIDTH));
    const cropBottom = Math.min(imageHeight, Math.round(top + PATCH_HEIGHT));
    const width = cropRight - cropLeft;
    const height = cropBottom - cropTop;
    if (width <= 0 || height <= 0) continue;

    // Cover the original furniture with the same classroom floor tile.
    const floorCols = Math.ceil(width / FLOOR_TILE.size);
    const floorRows = Math.ceil(height / FLOOR_TILE.size);
    for (let row = 0; row < floorRows; row += 1) {
      for (let col = 0; col < floorCols; col += 1) {
        const x = cropLeft + col * FLOOR_TILE.size;
        const y = cropTop + row * FLOOR_TILE.size;
        const w = Math.min(FLOOR_TILE.size, cropRight - x);
        const h = Math.min(FLOOR_TILE.size, cropBottom - y);
        if (w <= 0 || h <= 0) continue;

        scene.add
          .image(x + w / 2, y + h / 2, textureKey)
          .setOrigin(0.5)
          .setCrop(FLOOR_TILE.x * tileSize, FLOOR_TILE.y * tileSize, w, h)
          .setDisplaySize(w, h)
          .setDepth(1);
      }
    }

    // Rotate the original pixel-art desk/chair group 180 degrees so the
    // chair is on the classroom-facing side of the desk.
    scene.add
      .image(cropLeft + width / 2, cropTop + height / 2, textureKey)
      .setOrigin(0.5)
      .setCrop(cropLeft, cropTop, width, height)
      .setDisplaySize(width, height)
      .setAngle(180)
      .setDepth(2);
  }
}
