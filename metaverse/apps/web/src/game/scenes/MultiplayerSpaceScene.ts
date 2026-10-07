import { SpaceScene } from "./SpaceScene";
import { RemotePlayer } from "../entities/RemotePlayer";
import type { WokaAppearance } from "../woka/wokaConfig";
import { resolvePlayerLabel } from "../entities/playerLabel";
import { EventBus, SpaceEvent } from "../EventBus";
import { tileInRect } from "../config/spaces";

export type ArenaCallbacks = {
  onSceneReady: () => void;
  onMoveAttempt: (x: number, y: number) => void;
  onLocalTile?: (x: number, y: number) => void;
};

const DEPTH_REMOTE = 9;

export class MultiplayerSpaceScene extends SpaceScene {
  private remotes = new Map<string, RemotePlayer>();
  private localUserId: string | null = null;
  private knownAppearances = new Map<string, WokaAppearance>();
  private knownUsernames = new Map<string, string>();
  private lastSentTile: { x: number; y: number } | null = null;
  private portalTriggered = false;

  constructor(private callbacks: ArenaCallbacks) {
    super();
  }

  override create(): void {
    super.create();
    this.player.setDisplayName("you");
    this.callbacks.onSceneReady();
  }

  override update(time: number, delta: number): void {
    super.update(time, delta);
    for (const remote of this.remotes.values()) remote.update();
  }

  protected override onLocalStep(): void {
    const tile = this.movement.tile;
    if (this.lastSentTile?.x === tile.x && this.lastSentTile?.y === tile.y) return;
    this.lastSentTile = { x: tile.x, y: tile.y };
    this.callbacks.onMoveAttempt(tile.x, tile.y);
    this.callbacks.onLocalTile?.(tile.x, tile.y);

    // Room portals turn the garden-library map into the school's central hub.
    // The hub is a real walkable space: players walk to a doorway, cross it,
    // and enter the destination room. Other rooms use their lower-center
    // doorway to return to the hub. The classroom uses its right-hand door;
    // other rooms can retain their configured return doorway. Keep the rules here so adding a new room
    // later does not require changing the multiplayer transport layer.
    const target = this.resolveRoomPortal(tile);
    if (target && !this.portalTriggered) {
      this.portalTriggered = true;
      EventBus.emit(SpaceEvent.RoomPortal, target);
    } else if (!target) {
      this.portalTriggered = false;
    }
  }

  private resolveRoomPortal(tile: { x: number; y: number }): string | null {
    const configured = this.spaceConfig.portals?.find((portal) =>
      tileInRect(tile, portal.rect),
    );
    if (!configured) return null;

    // The classroom return door is on the right wall. Require the player to
    // face right into the door so merely walking past the wall cannot trigger it.
    if (this.spaceConfig.id === "classroom" && this.movement.facing !== "right") {
      return null;
    }

    return configured.target;
  }

  spawnLocal(x: number, y: number, userId: string): void {
    this.localUserId = userId;
    this.movement.forceSetTile({ x, y });
    this.lastSentTile = { x, y };
    this.cameras.main.centerOn(this.player.x, this.player.y);
    this.callbacks.onLocalTile?.(x, y);
  }

  addRemote(id: string, userId: string, x: number, y: number): void {
    if (this.remotes.has(id)) this.removeRemote(id);
    const remote = new RemotePlayer(
      this,
      this.grid,
      this.spaceConfig.tileSize,
      userId,
      { x, y },
      DEPTH_REMOTE,
    );
    this.remotes.set(id, remote);
    remote.player.setDisplayName(
      resolvePlayerLabel(userId, this.knownUsernames.get(userId)),
    );
    const known = this.knownAppearances.get(userId);
    if (known) remote.player.setAppearance(known);
  }

  moveRemote(id: string, x: number, y: number): void {
    this.remotes.get(id)?.applyPosition({ x, y });
  }

  removeRemote(id: string): void {
    this.remotes.get(id)?.destroy();
    this.remotes.delete(id);
  }

  rollbackLocal(x: number, y: number): void {
    this.movement.forceSetTile({ x, y });
    this.lastSentTile = { x, y };
    this.callbacks.onLocalTile?.(x, y);
  }

  setLocalTimer(text: string | null): void {
    this.player.setTimer(text);
  }

  showChatBubble(userId: string, text: string, duration = 4500): void {
    if (userId === this.localUserId) {
      this.player.showChatBubble(text, duration);
      return;
    }

    for (const remote of this.remotes.values()) {
      if (remote.userId === userId) {
        remote.player.showChatBubble(text, duration);
        return;
      }
    }
  }

  setUserMeta(
    userId: string,
    username: string | null,
    appearance: WokaAppearance | null,
  ): void {
    if (appearance) this.knownAppearances.set(userId, appearance);
    if (username?.trim()) this.knownUsernames.set(userId, username.trim());
    if (userId === this.localUserId) {
      if (username?.trim())
        this.player.setDisplayName(`${username.trim()} (you)`);
      if (appearance) this.player.setAppearance(appearance);
    }
    for (const remote of this.remotes.values()) {
      if (remote.userId !== userId) continue;
      remote.player.setDisplayName(
        resolvePlayerLabel(userId, this.knownUsernames.get(userId)),
      );
      if (appearance) remote.player.setAppearance(appearance);
    }
  }
}
