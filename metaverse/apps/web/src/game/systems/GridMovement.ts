import type Phaser from "phaser";
import type { TileCoord } from "../config/spaces";
import type { CollisionGrid } from "./CollisionGrid";

export type Direction = "up" | "down" | "left" | "right";

const DELTAS: Record<Direction, TileCoord> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const SPEED_TILES_PER_SECOND = 4.25;
// A long frame must never cross more than one tile in a single server move.
const MAX_FRAME_DELTA_MS = 100;

export type GridMovementHooks = {
  onWalk?: (dir: Direction) => void;
  onFace?: (dir: Direction) => void;
  onIdle?: (facing: Direction) => void;
  onTileChange?: () => void;
};

/** Smooth top-down movement while preserving the existing public API. */
export class GridMovement {
  private worldX: number;
  private worldY: number;
  private facingDir: Direction = "down";
  private walking = false;

  constructor(
    _scene: Phaser.Scene,
    private grid: CollisionGrid,
    private target: Phaser.GameObjects.Container,
    private tileSize: number,
    start: TileCoord,
    private hooks: GridMovementHooks = {},
  ) {
    this.worldX = (start.x + 0.5) * this.tileSize;
    this.worldY = (start.y + 1) * this.tileSize;
    this.snapToWorld();
  }

  get tile(): TileCoord {
    return this.worldToTile(this.worldX, this.worldY);
  }

  get facing(): Direction {
    return this.facingDir;
  }

  get moving(): boolean {
    return this.walking;
  }

  update(intent: Direction | null, deltaMs = 16.67): void {
    if (!intent) {
      if (this.walking) this.hooks.onIdle?.(this.facingDir);
      this.walking = false;
      return;
    }
    if (!Number.isFinite(deltaMs) || deltaMs <= 0) return;

    const elapsed = Math.min(deltaMs, MAX_FRAME_DELTA_MS);
    const distance = (this.tileSize * SPEED_TILES_PER_SECOND * elapsed) / 1000;
    this.advance(intent, distance);
  }

  step(dir: Direction): boolean {
    return this.advance(dir, this.tileSize * 0.25);
  }

  private advance(dir: Direction, distance: number): boolean {
    const turned = this.facingDir !== dir;
    this.facingDir = dir;
    const delta = DELTAS[dir];
    const nextX = this.worldX + delta.x * distance;
    const nextY = this.worldY + delta.y * distance;
    const previous = this.tile;
    const next = this.worldToTile(nextX, nextY);
    if (this.grid.isBlocked(next.x, next.y)) {
      if (turned || this.walking) this.hooks.onFace?.(dir);
      this.walking = false;
      return false;
    }

    this.worldX = nextX;
    this.worldY = nextY;
    this.snapToWorld();
    if (turned || !this.walking) this.hooks.onWalk?.(dir);
    this.walking = true;
    if (next.x !== previous.x || next.y !== previous.y) this.hooks.onTileChange?.();
    return true;
  }

  forceSetTile(tile: TileCoord): void {
    this.worldX = (tile.x + 0.5) * this.tileSize;
    this.worldY = (tile.y + 1) * this.tileSize;
    if (this.walking) this.hooks.onIdle?.(this.facingDir);
    this.walking = false;
    this.snapToWorld();
  }

  private worldToTile(worldX: number, worldY: number): TileCoord {
    return {
      x: Math.floor(worldX / this.tileSize),
      // The sprite anchor is half a tile below the logical tile center.
      y: Math.floor(worldY / this.tileSize - 0.5),
    };
  }

  private snapToWorld(): void {
    this.target.setPosition(this.worldX, this.worldY);
  }
}
