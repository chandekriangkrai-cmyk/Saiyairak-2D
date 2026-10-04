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
const DEPTH_UI = 1000;

const MOVEMENT_KEYS = "W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE,SHIFT";
const TEACHER_TILE: TileCoord = { x: 7, y: 4 };
const TABLET_TILE: TileCoord = { x: 10, y: 3 };

type InteractionTarget = TileCoord & {
  type: "npc" | "tablet";
  label: string;
};

const FACING_DELTA: Record<Direction, TileCoord> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
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
  private schoolNpc!: Woka;
  private tabletObject!: Phaser.GameObjects.Container;

  private dialogueBox!: Phaser.GameObjects.Container;
  private dialogueText!: Phaser.GameObjects.Text;
  private readonly dialoguePages = [
    "สวัสดีนักเรียน! ยินดีต้อนรับสู่ School Time",
    "วันนี้เราจะเริ่มเรียนภาษาอังกฤษกัน",
    "เดินไปที่แท็บเล็ต แล้วกด A เพื่อเริ่มกิจกรรม",
  ];
  private dialogueIndex = -1;

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

    // Dynamic classroom objects are part of the world and cannot be walked through.
    if (this.spaceConfig.id === "classroom") {
      this.grid.setBlocked(TEACHER_TILE.x, TEACHER_TILE.y, true);
      this.grid.setBlocked(TABLET_TILE.x, TABLET_TILE.y, true);
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
      this.createTeacher(tileSize);
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

    // A/Confirm on desktop is Space or Enter. Mobile uses the on-screen A button.
    this.input.keyboard?.on("keydown-SPACE", () => this.tryInteract());
    this.input.keyboard?.on("keydown-ENTER", () => this.tryInteract());
    this.input.keyboard?.on("keydown-B", () => this.dismissDialogue());
    this.input.keyboard?.on("keydown-X", () => this.dismissDialogue());

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
      this.input.keyboard?.off("keydown-X");
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

  private createTeacher(tileSize: number): void {
    this.schoolNpc = new Woka(this, tileSize);
    this.schoolNpc.setPosition(
      (TEACHER_TILE.x + 0.5) * tileSize,
      (TEACHER_TILE.y + 1) * tileSize,
    );
    this.schoolNpc.setDepth(DEPTH_PLAYER - 1);
    this.schoolNpc.setData("tile", TEACHER_TILE);
    this.schoolNpc.setData("label", "ครู");

    const npcLabel = this.add
      .text(
        (TEACHER_TILE.x + 0.5) * tileSize,
        TEACHER_TILE.y * tileSize - 8,
        "ครู",
        {
          fontFamily: "sans-serif",
          fontSize: "12px",
          color: "#ffffff",
          backgroundColor: "#14162bcc",
          padding: { x: 4, y: 2 },
        },
      )
      .setOrigin(0.5, 1)
      .setDepth(DEPTH_PLAYER + 1);
    this.schoolNpc.setData("labelObject", npcLabel);
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
    if (action === "B") {
      this.dismissDialogue();
      return;
    }
    this.tryInteract();
  }

  private tryInteract(): void {
    if (this.dialogueBox?.visible) {
      this.advanceDialogue();
      return;
    }

    const target = this.interactionTarget;
    if (!target) return;

    EventBus.emit(SpaceEvent.SchoolTimeInteract, target);

    if (target.type === "tablet") {
      this.autosave(true);
      this.pauseMovement();
      EventBus.emit(SpaceEvent.SchoolTimeLearningApp);
      return;
    }

    this.openDialogue();
  }

  private updateInteractionTarget(): void {
    if (this.spaceConfig.id !== "classroom" || this.dialogueBox?.visible) {
      this.setCurrentInteractionTarget(null);
      return;
    }

    const tile = this.movement.tile;
    const delta = FACING_DELTA[this.movement.facing];
    const front = { x: tile.x + delta.x, y: tile.y + delta.y };

    if (front.x === TEACHER_TILE.x && front.y === TEACHER_TILE.y) {
      this.setCurrentInteractionTarget({
        ...TEACHER_TILE,
        type: "npc",
        label: "ครู",
      });
      return;
    }

    if (front.x === TABLET_TILE.x && front.y === TABLET_TILE.y) {
      this.setCurrentInteractionTarget({
        ...TABLET_TILE,
        type: "tablet",
        label: "แท็บเล็ตภาษาอังกฤษ",
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
    const action = target.type === "tablet" ? "เปิด" : "คุยกับ";
    this.interactionHint.setText(`A · ${action} ${target.label}`).setVisible(true);
  }

  private openDialogue(): void {
    if (!this.dialogueBox) {
      const width = Math.min(this.scale.width - 24, 760);
      const bg = this.add
        .rectangle(0, 0, width, 104, 0x14162b, 0.96)
        .setOrigin(0, 0);
      bg.setStrokeStyle(2, 0xffc53d, 1);

      this.dialogueText = this.add.text(16, 14, "", {
        fontFamily: "sans-serif",
        fontSize: "16px",
        color: "#ffffff",
        wordWrap: { width: width - 32 },
      });

      const hint = this.add
        .text(width - 16, 80, "A: ต่อ  B: ปิด", {
          fontFamily: "sans-serif",
          fontSize: "11px",
          color: "#ffc53d",
        })
        .setOrigin(1, 0);

      this.dialogueBox = this.add
        .container(12, this.scale.height - 120, [bg, this.dialogueText, hint])
        .setScrollFactor(0)
        .setDepth(DEPTH_UI);
    }

    this.dialogueIndex = 0;
    this.dialogueText.setText(this.dialoguePages[this.dialogueIndex]!);
    this.dialogueBox.setVisible(true);
    this.interactionHint.setVisible(false);
    this.pauseMovement();
  }

  private advanceDialogue(): void {
    if (!this.dialogueBox?.visible) return;
    if (this.dialogueIndex >= this.dialoguePages.length - 1) {
      this.dismissDialogue();
      return;
    }

    this.dialogueIndex += 1;
    this.dialogueText.setText(this.dialoguePages[this.dialogueIndex]!);
  }

  private dismissDialogue(): void {
    if (!this.dialogueBox?.visible) return;
    this.dialogueIndex = -1;
    this.dialogueBox.setVisible(false);
    this.resumeMovement();
  }

  private pauseMovement(): void {
    this.movementEnabled = false;
    this.virtualDirection = null;
    this.movement.update(null);
  }

  private resumeMovement(): void {
    this.movementEnabled = true;
  }

  private autosave(force = false): void {
    if (this.dialogueBox?.visible) return;

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
