import Phaser from "phaser";
import { EventBus, SpaceEvent } from "../EventBus";
import type { SpaceConfig, TileCoord } from "../config/spaces";
import { CollisionGrid, type CollisionRows } from "../systems/CollisionGrid";
import { GridMovement, type Direction } from "../systems/GridMovement";
import { CameraController } from "../systems/CameraController";
import { CLASSROOM_V2_OBJECTS } from "../config/classroomV2";
import type { CollisionEditor } from "../systems/CollisionEditor";
import { applyClassroomFurnitureOrientation } from "../systems/ClassroomFurnitureOrientation";
import { Player } from "../entities/Player";
import type { WokaAppearance } from "../woka/wokaConfig";
import {
  SPACE_FOREGROUND_TEXTURE,
  SPACE_TEXTURE,
  type SpaceSceneData,
} from "./BootScene";

const DEPTH_SPACE = 0;
const DEPTH_PLAYER = 10;
const DEPTH_FOREGROUND = 20;
const DEPTH_UI = 1000;

const MOVEMENT_KEYS = "W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE,SHIFT";
const TABLET_TILE: TileCoord = { x: 10, y: 3 };

type InteractionTarget = TileCoord & {
  type: "tablet" | "classroom-object";
  label: string;
  objectId?: string;
  interaction?: string;
};

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

  private interactionTarget: InteractionTarget | null = null;
  private interactionHint!: Phaser.GameObjects.Text;
  private tabletObject!: Phaser.GameObjects.Container;

  private readonly saveKey = "school-time-save-v1";
  private lastSaveSignature = "";

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

    if (this.spaceConfig.id === "classroom") {
      this.grid.setBlocked(TABLET_TILE.x, TABLET_TILE.y, true);
      for (const object of CLASSROOM_V2_OBJECTS) {
        const w = object.size?.w ?? 1;
        const h = object.size?.h ?? 1;
        if (object.blocked) {
          for (let y = 0; y < h; y += 1) {
            for (let x = 0; x < w; x += 1) {
              this.grid.setBlocked(object.tile.x + x, object.tile.y + y, true);
            }
          }
        }
      }
      applyClassroomFurnitureOrientation(this, SPACE_TEXTURE, tileSize);
      this.renderClassroomV2(tileSize);
    }

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
    if (saved && !this.grid.isBlocked(saved.x, saved.y)) {
      this.movement.forceSetTile(saved);
    }

    if (this.spaceConfig.id === "classroom") {
      this.createTablet(tileSize);
    }

    this.cameraController = new CameraController(
      this,
      this.player,
      image.width,
      image.height,
      tileSize,
    );

    this.createInteractionHint();

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = this.input.keyboard!.addKeys("W,A,S,D") as SpaceScene["wasd"];

    this.input.keyboard?.on("keydown-SPACE", () => this.tryInteract());
    this.input.keyboard?.on("keydown-ENTER", () => this.tryInteract());

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
    });

    EventBus.emit(SpaceEvent.SceneReady);
  }

  update(_time: number, delta: number): void {
    this.movement.update(this.readDirection(), delta);
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


  private renderClassroomV2(tileSize: number): void {
    const textureKey = "classroom-v2-primary-0";
    if (!this.textures.exists(textureKey)) return;

    // The imported CC0 sheet is intentionally kept as source art. We crop
    // selected furniture pieces at runtime so no second atlas/metadata format
    // is required and the gameplay coordinates stay independent of filenames.
    const crops: Record<string, { x: number; y: number; w: number; h: number }> = {
      board: { x: 750, y: 45, w: 195, h: 155 },
      bookshelf: { x: 15, y: 150, w: 610, h: 260 },
      "student-desk": { x: 445, y: 845, w: 145, h: 125 },
      "teacher-desk": { x: 250, y: 675, w: 170, h: 135 },
      computer: { x: 640, y: 300, w: 180, h: 100 },
    };

    for (const object of CLASSROOM_V2_OBJECTS) {
      const crop = crops[object.kind];
      if (!crop) continue;
      const sprite = this.add
        .image((object.tile.x + (object.size?.w ?? 1) / 2) * tileSize,
          (object.tile.y + (object.size?.h ?? 1) / 2) * tileSize,
          textureKey)
        .setOrigin(0.5)
        .setCrop(crop.x, crop.y, crop.w, crop.h)
        .setDepth(DEPTH_SPACE + 1);

      const targetW = Math.max(tileSize * (object.size?.w ?? 1), crop.w * 0.55);
      const targetH = Math.max(tileSize * (object.size?.h ?? 1), crop.h * 0.55);
      sprite.setDisplaySize(targetW, targetH);
      sprite.setData("classroomObjectId", object.id);
      sprite.setData("interaction", object.interaction ?? null);
    }
  }

  private createTablet(tileSize: number): void {
    const outer = this.add
      .rectangle(0, 0, 34, 26, 0x111827, 1)
      .setStrokeStyle(2, 0x94a3b8, 1);
    const screen = this.add.rectangle(0, -1, 26, 17, 0x38bdf8, 1);
    const shine = this.add.rectangle(-7, -4, 6, 3, 0xe0f2fe, 0.8);
    const stand = this.add.rectangle(0, 16, 14, 4, 0x475569, 1);

    this.tabletObject = this.add
      .container(
        (TABLET_TILE.x + 0.5) * tileSize,
        (TABLET_TILE.y + 1) * tileSize - 18,
        [stand, outer, screen, shine],
      )
      .setDepth(DEPTH_PLAYER + 1);

    this.tabletObject.setData("tile", TABLET_TILE);
    this.tabletObject.setData("label", "แท็บเล็ตภาษาอังกฤษ");

    this.add
      .text(
        (TABLET_TILE.x + 0.5) * tileSize,
        TABLET_TILE.y * tileSize - 5,
        "English Tablet",
        {
          fontFamily: "sans-serif",
          fontSize: "10px",
          color: "#e0f2fe",
          backgroundColor: "#0f172acc",
          padding: { x: 4, y: 2 },
        },
      )
      .setOrigin(0.5, 1)
      .setDepth(DEPTH_PLAYER + 2);
  }

  private createInteractionHint(): void {
    this.interactionHint = this.add
      .text(this.scale.width / 2, this.scale.height - 36, "", {
        fontFamily: "sans-serif",
        fontSize: "14px",
        color: "#201800",
        backgroundColor: "#ffc53d",
        padding: { x: 12, y: 7 },
      })
      .setOrigin(0.5, 1)
      .setScrollFactor(0)
      .setDepth(DEPTH_UI)
      .setVisible(false);
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

  private onSchoolAction(action: string): void {
    if (action === "B") return;
    this.tryInteract();
  }

  private tryInteract(): void {
    const target = this.interactionTarget;
    if (!target) return;

    EventBus.emit(SpaceEvent.SchoolTimeInteract, target);
    this.autosave(true);

    if (target.type === "tablet") {
      this.pauseMovement();
      EventBus.emit(SpaceEvent.SchoolTimeLearningApp);
      return;
    }

    // Classroom furniture interactions are intentionally lightweight until
    // their dedicated learning activities are wired into the UI. Keep the
    // player in control instead of opening the tablet app for every object.
    this.interactionHint
      .setText(`✓ ${target.label}`)
      .setVisible(true);
    this.time.delayedCall(900, () => {
      if (this.interactionTarget?.objectId === target.objectId) {
        this.updateInteractionTarget();
      }
    });
  }

  private updateInteractionTarget(): void {
    if (this.spaceConfig.id !== "classroom") {
      this.setCurrentInteractionTarget(null);
      return;
    }

    const tile = this.movement.tile;
    const facing = this.movement.facing;
    const delta: TileCoord =
      facing === "up"
        ? { x: 0, y: -1 }
        : facing === "down"
          ? { x: 0, y: 1 }
          : facing === "left"
            ? { x: -1, y: 0 }
            : { x: 1, y: 0 };
    const front = { x: tile.x + delta.x, y: tile.y + delta.y };

    if (front.x === TABLET_TILE.x && front.y === TABLET_TILE.y) {
      this.setCurrentInteractionTarget({
        ...TABLET_TILE,
        type: "tablet",
        label: "แท็บเล็ตภาษาอังกฤษ",
      });
      return;
    }

    const object = CLASSROOM_V2_OBJECTS.find((candidate) => {
      const w = candidate.size?.w ?? 1;
      const h = candidate.size?.h ?? 1;
      return (
        front.x >= candidate.tile.x &&
        front.x < candidate.tile.x + w &&
        front.y >= candidate.tile.y &&
        front.y < candidate.tile.y + h &&
        Boolean(candidate.interaction)
      );
    });

    if (object?.interaction) {
      this.setCurrentInteractionTarget({
        ...front,
        type: "classroom-object",
        label: this.classroomInteractionLabel(object.interaction),
        objectId: object.id,
        interaction: object.interaction,
      });
      return;
    }

    this.setCurrentInteractionTarget(null);
  }

  private setCurrentInteractionTarget(target: InteractionTarget | null): void {
    this.interactionTarget = target;
    if (!this.interactionHint) return;
    if (!target) {
      this.interactionHint.setVisible(false);
      return;
    }
    this.interactionHint
      .setText(`กด Enter / Space เพื่อ${target.label}`)
      .setVisible(true);
  }

  private classroomInteractionLabel(interaction: string): string {
    switch (interaction) {
      case "open-board":
        return "เปิดกระดาน";
      case "teacher-zone":
        return "เข้าพื้นที่ครู";
      case "student-seat":
        return "นั่งโต๊ะเรียน";
      case "bookshelf":
        return "เปิดชั้นหนังสือ";
      case "computer":
        return "ใช้คอมพิวเตอร์";
      case "exit-classroom":
        return "ออกจากห้องเรียน";
      default:
        return "โต้ตอบ";
    }
  }

  private pauseMovement(): void {
    this.movementEnabled = false;
    this.virtualDirection = null;
    this.movement.update(null);
  }

  private autosave(force = false): void {
    const tile = this.movement.tile;
    const signature = `${this.spaceConfig.id}:${tile.x}:${tile.y}`;
    if (!force && signature === this.lastSaveSignature) return;

    try {
      localStorage.setItem(
        this.saveKey,
        JSON.stringify({
          x: tile.x,
          y: tile.y,
          facing: this.movement.facing,
          space: this.spaceConfig.id,
          savedAt: Date.now(),
        }),
      );
      this.lastSaveSignature = signature;
    } catch {
      // Storage can be unavailable in private browsing; gameplay must continue.
    }
  }

  private readSave(): TileCoord | null {
    try {
      const raw = localStorage.getItem(this.saveKey);
      if (!raw) return null;
      const data = JSON.parse(raw) as {
        x?: number;
        y?: number;
        space?: string;
      };
      if (
        data.space !== this.spaceConfig.id ||
        typeof data.x !== "number" ||
        typeof data.y !== "number"
      ) {
        return null;
      }
      return { x: data.x, y: data.y };
    } catch {
      return null;
    }
  }

  setInteractionTarget(target: InteractionTarget | null): void {
    this.setCurrentInteractionTarget(target);
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

    for (let radius = 1; radius < Math.max(this.grid.cols, this.grid.rows); radius++) {
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
          if (!this.grid.isBlocked(cx + dx, cy + dy)) {
            return { x: cx + dx, y: cy + dy };
          }
        }
      }
    }

    return { x: cx, y: cy };
  }
}
