import Phaser from "phaser";
import type { TileCoord } from "../config/spaces";
import type { CollisionGrid } from "./CollisionGrid";

export type Direction = "up" | "down" | "left" | "right";

const DELTAS: Record<Direction, TileCoord> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const DEFAULT_SPEED_TILES_PER_SECOND = 4.25;
const MIN_COLLISION_RADIUS = 9;

export type GridMovementHooks = {
  onWalk?: (dir: Direction) => void;
  onFace?: (dir: Direction) => void;
  onIdle?: (facing: Direction) => void;
};

/** Smooth top-down movement while preserving the existing public API. */
export class GridMovement {
  private worldX: number;
  private worldY: number;
  private facingDir: Direction = "down";
  private walking = false;
  private lastWalkHookAt = 0;
  private readonly speedTilesPerSecond = DEFAULT_SPEED_TILES_PER_SECOND;

  constructor(
    private scene: Phaser.Scene,
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
      if (this.walking) {
        this.walking = false;
        this.hooks.onIdle?.(this.facingDir);
      }
      return;
    }

    if (intent !== this.facingDir) {
      this.facingDir = intent;
      this.hooks.onFace?.(intent);
    }

    const distance =
      (this.tileSize * this.speedTilesPerSecond * Math.max(0, deltaMs)) / 1000;
    const delta = DELTAS[intent];
    const previousX = this.worldX;
    const previousY = this.worldY;

    const nextX = this.worldX + delta.x * distance;
    if (this.canOccupy(nextX, this.worldY)) this.worldX = nextX;

    const nextY = this.worldY + delta.y * distance;
    if (this.canOccupy(this.worldX, nextY)) this.worldY = nextY;

    const moved = this.worldX !== previousX || this.worldY !== previousY;
    this.snapToWorld();

    if (moved) {
      this.walking = true;
      const now = this.scene.time.now;
      if (now - this.lastWalkHookAt >= 50) {
        this.lastWalkHookAt = now;
        this.hooks.onWalk?.(intent);
      }
    } else {
      this.walking = false;
      this.hooks.onFace?.(intent);
    }
  }

  step(dir: Direction): boolean {
    this.facingDir = dir;
    this.hooks.onFace?.(dir);
    const distance = this.tileSize * 0.25;
    const delta = DELTAS[dir];
    const nextX = this.worldX + delta.x * distance;
    const nextY = this.worldY + delta.y * distance;
    if (!this.canOccupy(nextX, nextY)) return false;
    this.worldX = nextX;
    this.worldY = nextY;
    this.walking = true;
    this.snapToWorld();
    this.hooks.onWalk?.(dir);
    return true;
  }

  forceSetTile(tile: TileCoord): void {
    this.worldX = (tile.x + 0.5) * this.tileSize;
    this.worldY = (tile.y + 1) * this.tileSize;
    this.walking = false;
    this.snapToWorld();
  }

  private canOccupy(worldX: number, worldY: number): boolean {
    const radius = Math.max(MIN_COLLISION_RADIUS, Math.min(this.tileSize * 0.2, 12));
    const samples = [
      [worldX - radius, worldY - radius],
      [worldX + radius, worldY - radius],
      [worldX - radius, worldY + radius],
      [worldX + radius, worldY + radius],
    ];
    return samples.every(([x, y]) => {
      const tile = this.worldToTile(x, y);
      return !this.grid.isBlocked(tile.x, tile.y);
    });
  }

  private worldToTile(worldX: number, worldY: number): TileCoord {
    return {
      x: Math.floor(worldX / this.tileSize),
      y: Math.floor(worldY / this.tileSize) - 1,
    };
  }

  private snapToWorld(): void {
    this.target.setPosition(this.worldX, this.worldY);
  }
}
