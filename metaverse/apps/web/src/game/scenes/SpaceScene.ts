import Phaser from "phaser";
import { EventBus, SpaceEvent } from "../EventBus";
import type { SpaceConfig, TileCoord } from "../config/spaces";
import { CollisionGrid, type CollisionRows } from "../systems/CollisionGrid";
import { GridMovement, type Direction } from "../systems/GridMovement";
import { CameraController } from "../systems/CameraController";
import type { CollisionEditor } from "../systems/CollisionEditor";
import { Player } from "../entities/Player";
import { Woka } from "../entities/Woka";
import type { WokaAppearance } from "../woka/wokaConfig";
import {
  SPACE_FOREGROUND_TEXTURE,
  SPACE_TEXTURE,
  type SpaceSceneData,
} from "./BootScene";

const DEPTH_SPACE = 0;
const DEPTH_PLAYER = 10;
const DEPTH_FOREGROUND = 20;

const MOVEMENT_KEYS = "W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE,SHIFT";

export class SpaceScene extends Phaser.Scene {
  protected spaceConfig!: SpaceConfig;
  private collisionSource: CollisionRows | null = null;

  protected grid!: CollisionGrid;
  protected player!: Player;
  protected movement!: GridMovement;
  private cameraController!: CameraController;
  private editor: CollisionEditor | null = null;

  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<"W" | "A" | "S" | "D", Phaser.Input.Keyboard.Key>;
  private virtualDirection: Direction | null = null;
  private movementEnabled = true;
  private interactionTarget: { x: number; y: number; label: string } | null = null;
  private schoolNpc!: Woka;
  private dialogueBox!: Phaser.GameObjects.Container;
  private dialogueText!: Phaser.GameObjects.Text;
  private dialoguePages = [
    "สวัสดีนักเรียน! ยินดีต้อนรับสู่ School Time",
    "วันนี้เราจะเริ่มเรียนภาษาอังกฤษกัน",
    "เดินไปที่แท็บเล็ต แล้วกด A เพื่อเริ่มกิจกรรม",
  ];
  private dialogueIndex = -1;
  private saveKey = "school-time-save-v1";

  constructor() {
    super("space");
  }

  init(data: SpaceSceneData): void {
    this.spaceConfig = data.config;
    this.collisionSource = data.collisionSource;
  }

  create(): void {
    const tileSize = this.spaceConfig.tileSize;

    const image = this.add
      .image(0, 0, SPACE_TEXTURE)
      .setOrigin(0)
      .setDepth(DEPTH_SPACE);
    if (this.textures.exists(SPACE_FOREGROUND_TEXTURE)) {
      this.add
        .image(0, 0, SPACE_FOREGROUND_TEXTURE)
        .setOrigin(0)
        .setDepth(DEPTH_FOREGROUND);
    }

    const cols = Math.ceil(image.width / tileSize);
    const rows = Math.ceil(image.height / tileSize);
    this.grid = new CollisionGrid(cols, rows, this.collisionSource);

    const spawn = this.resolveSpawn(this.spaceConfig.spawnTile);
    this.player = new Player(this, 0, 0, tileSize);
    this.player.setDepth(DEPTH_PLAYER);
    this.movement = new GridMovement(
      this,
      this.grid,
      this.player,
      tileSize,
      spawn,
      {
        onWalk: (dir) => {
          this.player.playWalk(dir);
          this.onLocalStep();
        },
        onFace: (dir) => this.player.faceIdle(dir),
        onIdle: (dir) => this.player.faceIdle(dir),
      },
    );

    const saved = this.readSave();
    if (saved) {
      this.movement.forceSetTile(saved);
    }

    this.schoolNpc = new Woka(this, tileSize);
    this.schoolNpc.setPosition((7.5) * tileSize, (4 + 1) * tileSize);
    this.schoolNpc.setDepth(DEPTH_PLAYER - 1);
    const npcLabel = this.add.text(7.5 * tileSize, 4 * tileSize - 8, "ครู", {
      fontFamily: "sans-serif", fontSize: "12px", color: "#ffffff", backgroundColor: "#14162bcc", padding: { x: 4, y: 2 },
    }).setOrigin(0.5, 1).setDepth(DEPTH_PLAYER + 1);
    this.schoolNpc.setData("tile", { x: 7, y: 4 });
    this.schoolNpc.setData("label", "ครู");
    this.schoolNpc.setData("labelObject", npcLabel);

    this.cameraController = new CameraController(
      this,
      this.player,
      image.width,
      image.height,
      tileSize,
    );

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = this.input.keyboard!.addKeys("W,A,S,D") as SpaceScene["wasd"];

    // School Time: keyboard/mobile action hook. The target is intentionally data-driven
    // so NPCs and interactive objects can be added without changing movement logic.
    this.input.keyboard?.on("keydown-SPACE", () => this.tryInteract());
    this.input.keyboard?.on("keydown-ENTER", () => this.tryInteract());
    this.input.keyboard?.on("keydown-B", () => this.closeDialogue());

    if (import.meta.env.DEV) {
      import("../systems/CollisionEditor").then(({ CollisionEditor }) => {
        if (!this.sys.isActive()) return;
        this.editor = new CollisionEditor(
          this,
          this.grid,
          tileSize,
          this.movement,
          this.spaceConfig,
        );
      });
    }

    EventBus.on(SpaceEvent.PlayerName, this.onPlayerName, this);
    EventBus.on(SpaceEvent.PlayerAppearance, this.onPlayerAppearance, this);
    EventBus.on(SpaceEvent.MoveDirection, this.onMoveDirection, this);
    EventBus.on(SpaceEvent.SchoolTimeAction, this.onSchoolAction, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      EventBus.off(SpaceEvent.PlayerName, this.onPlayerName, this);
      EventBus.off(SpaceEvent.PlayerAppearance, this.onPlayerAppearance, this);
      EventBus.off(SpaceEvent.MoveDirection, this.onMoveDirection, this);
      EventBus.off(SpaceEvent.SchoolTimeAction, this.onSchoolAction, this);
      this.input.keyboard?.off("keydown-SPACE");
      this.input.keyboard?.off("keydown-ENTER");
      this.input.keyboard?.off("keydown-B");
    });
    EventBus.emit(SpaceEvent.SceneReady);
  }

  update(_time: number, delta: number): void {
    this.movement.update(this.readDirection());
    this.updateInteractionTarget();
    this.autosave();
    this.cameraController.update(delta);
    this.editor?.update();
  }

  protected onLocalStep(): void {}

  setKeyboardEnabled(enabled: boolean): void {
    this.movementEnabled = enabled;
    if (!enabled) {
      this.virtualDirection = null;
      this.movement.update(null);
    }
    const keyboard = this.input?.keyboard;
    if (!keyboard) return;
    keyboard.enabled = enabled;
    if (enabled) {
      keyboard.addCapture(MOVEMENT_KEYS);
    } else {
      keyboard.resetKeys();
      keyboard.removeCapture(MOVEMENT_KEYS);
    }
  }

  private onPlayerName(name: string): void {
    this.player.setDisplayName(name);
  }

  private onPlayerAppearance(appearance: WokaAppearance): void {
    this.player.setAppearance(appearance);
  }

  private onMoveDirection(direction: Direction | null): void {
    this.virtualDirection = this.movementEnabled ? direction : null;
  }

  private tryInteract(): void {
    if (this.interactionTarget) {
      this.openDialogue();
      EventBus.emit(SpaceEvent.SchoolTimeInteract, this.interactionTarget);
    }
  }

  private onSchoolAction(action: string): void {
    if (action === "B") {
      this.closeDialogue();
      return;
    }
    this.tryInteract();
  }

  private updateInteractionTarget(): void {
    const npcTile = this.schoolNpc.getData("tile") as { x: number; y: number };
    const tile = this.movement.tile;
    const near = Math.max(Math.abs(tile.x - npcTile.x), Math.abs(tile.y - npcTile.y)) <= 1;
    this.interactionTarget = near ? { ...npcTile, label: "ครู" } : null;
  }

  private openDialogue(): void {
    if (!this.dialogueBox) {
      const width = Math.min(this.scale.width - 24, 760);
      const bg = this.add.rectangle(0, 0, width, 104, 0x14162b, 0.96).setOrigin(0, 0);
      bg.setStrokeStyle(2, 0xffc53d, 1);
      this.dialogueText = this.add.text(16, 14, "", { fontFamily: "sans-serif", fontSize: "16px", color: "#ffffff", wordWrap: { width: width - 32 } });
      const hint = this.add.text(width - 16, 80, "A: ต่อ  B: ปิด", { fontFamily: "sans-serif", fontSize: "11px", color: "#ffc53d" }).setOrigin(1, 0);
      this.dialogueBox = this.add.container(12, this.scale.height - 120, [bg, this.dialogueText, hint]).setScrollFactor(0).setDepth(1000);
    }
    this.dialogueIndex = Math.min(this.dialogueIndex + 1, this.dialoguePages.length - 1);
    this.dialogueText.setText(this.dialoguePages[this.dialogueIndex]!);
    this.dialogueBox.setVisible(true);
    this.setKeyboardEnabled(false);
  }

  private closeDialogue(): void {
    if (!this.dialogueBox?.visible) return;
    if (this.dialogueIndex < this.dialoguePages.length - 1) {
      this.dialogueIndex++;
      this.dialogueText.setText(this.dialoguePages[this.dialogueIndex]!);
      return;
    }
    this.dialogueIndex = -1;
    this.dialogueBox.setVisible(false);
    this.setKeyboardEnabled(true);
  }

  private autosave(): void {
    if (this.dialogueBox?.visible) return;
    const t = this.movement.tile;
    try { localStorage.setItem(this.saveKey, JSON.stringify({ x: t.x, y: t.y, space: this.spaceConfig.id, savedAt: Date.now() })); } catch {}
  }

  private readSave(): { x: number; y: number } | null {
    try {
      const raw = localStorage.getItem(this.saveKey);
      if (!raw) return null;
      const data = JSON.parse(raw) as { x?: number; y?: number; space?: string };
      if (data.space !== this.spaceConfig.id || typeof data.x !== "number" || typeof data.y !== "number") return null;
      return { x: data.x, y: data.y };
    } catch { return null; }
  }

  setInteractionTarget(target: { x: number; y: number; label: string } | null): void {
    this.interactionTarget = target;
  }

  private readDirection(): Direction | null {
    if (!this.movementEnabled) return null;
    if (this.virtualDirection) return this.virtualDirection;
    if (this.cursors.left.isDown || this.wasd.A.isDown) return "left";
    if (this.cursors.right.isDown || this.wasd.D.isDown) return "right";
    if (this.cursors.up.isDown || this.wasd.W.isDown) return "up";
    if (this.cursors.down.isDown || this.wasd.S.isDown) return "down";
    return null;
  }

  private resolveSpawn(preferred: TileCoord): TileCoord {
    const cx = Phaser.Math.Clamp(preferred.x, 0, this.grid.cols - 1);
    const cy = Phaser.Math.Clamp(preferred.y, 0, this.grid.rows - 1);
    if (!this.grid.isBlocked(cx, cy)) return { x: cx, y: cy };
    for (let r = 1; r < Math.max(this.grid.cols, this.grid.rows); r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (!this.grid.isBlocked(cx + dx, cy + dy))
            return { x: cx + dx, y: cy + dy };
        }
      }
    }
    return { x: cx, y: cy };
  }
}
