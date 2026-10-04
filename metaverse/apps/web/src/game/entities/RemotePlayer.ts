import Phaser from "phaser";
import type { TileCoord } from "../config/spaces";
import type { CollisionGrid } from "../systems/CollisionGrid";
import type { Direction } from "../systems/GridMovement";
import { Player } from "./Player";

const REMOTE_MOVE_MS = 170;

export class RemotePlayer {
  readonly player: Player;
  private serverTile: TileCoord;
  private tween: Phaser.Tweens.Tween | null = null;

  constructor(
    scene: Phaser.Scene,
    _grid: CollisionGrid,
    private readonly tileSize: number,
    readonly userId: string,
    start: TileCoord,
    depth: number,
  ) {
    this.player = new Player(scene, 0, 0, tileSize);
    this.player.setDepth(depth);
    this.serverTile = { ...start };
    this.snapToTile(start);
  }

  update(): void {
    // Remote players are server-authoritative. Their visual position is driven
    // by server updates rather than the local collision controller.
  }

  applyPosition(tile: TileCoord): void {
    if (tile.x === this.serverTile.x && tile.y === this.serverTile.y) return;

    const direction = singleStepDirection(
      tile.x - this.serverTile.x,
      tile.y - this.serverTile.y,
    );
    this.serverTile = { ...tile };

    if (direction) this.player.playWalk(direction);

    this.tween?.stop();
    this.tween = this.player.scene.tweens.add({
      targets: this.player,
      x: this.pixelX(tile.x),
      y: this.pixelY(tile.y),
      duration: REMOTE_MOVE_MS,
      ease: "Linear",
      onComplete: () => {
        this.tween = null;
        if (direction) this.player.faceIdle(direction);
      },
    });
  }

  destroy(): void {
    this.tween?.stop();
    this.tween = null;
    this.player.destroy();
  }

  private snapToTile(tile: TileCoord): void {
    this.player.setPosition(this.pixelX(tile.x), this.pixelY(tile.y));
  }

  private pixelX(x: number): number {
    return (x + 0.5) * this.tileSize;
  }

  private pixelY(y: number): number {
    return (y + 1) * this.tileSize;
  }
}

function singleStepDirection(dx: number, dy: number): Direction | null {
  if (dx === 1 && dy === 0) return "right";
  if (dx === -1 && dy === 0) return "left";
  if (dx === 0 && dy === 1) return "down";
  if (dx === 0 && dy === -1) return "up";
  return null;
}
