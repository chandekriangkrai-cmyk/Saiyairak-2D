import Phaser from "phaser";
import { EventBus, SpaceEvent } from "../EventBus";
import type { SpaceConfig, TileCoord } from "../config/spaces";
import { CollisionGrid, type CollisionRows } from "../systems/CollisionGrid";
import { GridMovement, type Direction } from "../systems/GridMovement";
import { CameraController } from "../systems/CameraController";
import type { CollisionEditor } from "../systems/CollisionEditor";
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

const MOVEMENT_KEYS = "W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE,SHIFT";
const TABLET_TILE: TileCoord = { x: 19, y: 9 };

// Classroom is intentionally a self-contained play space. Keep the player
// inside the room while leaving the furniture collision from the imported map.
const CLASSROOM_BOUNDS = { left: 11, right: 24, top: 9, bottom: 20 } as const;
// In the classroom, desks and chairs are intentionally walk-through.
// Only the teacher's desk at the front remains solid.
const CLASSROOM_TEACHER_DESK = { left: 17, right: 20, top: 9, bottom: 9 } as const;

type InteractionTarget = TileCoord & {
  type: "tablet";
  label: string;
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
      this.configureClassroomWalkability();
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

    if (this.spaceConfig.id === "cafe") {
      this.createCafeFurniture(tileSize);
    }

    this.cameraController = new CameraController(
      this,
      this.player,
      image.width,
      image.height,
      tileSize,
    );

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

  private configureClassroomWalkability(): void {
    // Do not inherit the old furniture collision map for this room.
    // Students can walk through desks/chairs freely; only the room boundary
    // and the teacher desk at the front are solid.
    for (let y = 0; y < this.grid.rows; y++) {
      for (let x = 0; x < this.grid.cols; x++) {
        const inside =
          x >= CLASSROOM_BOUNDS.left &&
          x <= CLASSROOM_BOUNDS.right &&
          y >= CLASSROOM_BOUNDS.top &&
          y <= CLASSROOM_BOUNDS.bottom;
        this.grid.setBlocked(x, y, !inside);
      }
    }

    for (let y = CLASSROOM_TEACHER_DESK.top; y <= CLASSROOM_TEACHER_DESK.bottom; y++) {
      for (let x = CLASSROOM_TEACHER_DESK.left; x <= CLASSROOM_TEACHER_DESK.right; x++) {
        this.grid.setBlocked(x, y, true);
      }
    }

    // The tablet sits on the teacher desk, so it must remain non-walkable too.
    this.grid.setBlocked(TABLET_TILE.x, TABLET_TILE.y, true);

    // The classroom exits through the real door on the right-hand wall.
    // Keep the wall solid everywhere else, but open the doorway tile so the
    // player can physically walk through it before the room portal fires.
    for (let y = 10; y <= 16; y++) {
      this.grid.setBlocked(25, y, false);
    }

    // The bottom-center doorway is the classroom's physical connection to the
    // central school hub. Keep the rest of the lower edge closed so the player
    // cannot walk outside the room artwork.
    for (let y = 20; y < this.grid.rows; y++) {
      for (let x = CLASSROOM_BOUNDS.left; x <= CLASSROOM_BOUNDS.right; x++) {
        if (x < 17 || x > 21) this.grid.setBlocked(x, y, true);
      }
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
    this.tabletObject.setInteractive(
      new Phaser.Geom.Rectangle(-18, -15, 36, 34),
      Phaser.Geom.Rectangle.Contains,
    );
    this.tabletObject.on("pointerdown", () => {
      if (!this.isNearTablet()) return;
      this.setCurrentInteractionTarget({
        ...TABLET_TILE,
        type: "tablet",
        label: "แท็บเล็ตภาษาอังกฤษ",
      });
      this.tryInteract();
    });

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

  private createCafeFurniture(tileSize: number): void {
    // Cafe decoration is made from real Phaser sprites, not baked into the map image.
    const makeTexture = (key: string, draw: (g: Phaser.GameObjects.Graphics) => void) => {
      if (this.textures.exists(key)) return;
      const g = this.add.graphics();
      draw(g);
      g.generateTexture(key, tileSize * 2, tileSize * 2);
      g.destroy();
    };

    makeTexture("cafe-table", (g) => {
      g.fillStyle(0x4a2b20, 1); g.fillEllipse(40, 45, 62, 34);
      g.fillStyle(0xa66a3c, 1); g.fillEllipse(40, 34, 66, 38);
      g.fillStyle(0xc48a4d, 1); g.fillEllipse(40, 31, 56, 30);
      g.fillStyle(0x6a3d28, 1); g.fillRect(34, 45, 12, 22);
    });
    makeTexture("cafe-chair", (g) => {
      g.fillStyle(0x3b2924, 1); g.fillRoundedRect(22, 28, 36, 30, 7);
      g.fillStyle(0x8d5b3d, 1); g.fillRoundedRect(26, 32, 28, 18, 5);
      g.fillStyle(0x4b3025, 1); g.fillRect(28, 55, 5, 14); g.fillRect(47, 55, 5, 14);
    });
    makeTexture("cafe-sofa", (g) => {
      g.fillStyle(0x34231f, 1); g.fillRoundedRect(10, 24, 60, 38, 9);
      g.fillStyle(0x765047, 1); g.fillRoundedRect(14, 20, 52, 34, 8);
      g.fillStyle(0x93635a, 1); g.fillRoundedRect(20, 26, 40, 22, 5);
      g.fillStyle(0x4b3028, 1); g.fillRect(18, 58, 7, 8); g.fillRect(55, 58, 7, 8);
    });
    makeTexture("cafe-plant", (g) => {
      g.fillStyle(0x9b6035, 1); g.fillRoundedRect(28, 48, 24, 18, 5);
      g.fillStyle(0x3f7e49, 1); g.fillEllipse(25, 35, 26, 38); g.fillEllipse(48, 28, 28, 42); g.fillEllipse(62, 38, 25, 34);
      g.fillStyle(0x66a95e, 1); g.fillEllipse(38, 25, 22, 34); g.fillEllipse(54, 18, 20, 32);
    });
    makeTexture("cafe-shelf", (g) => {
      g.fillStyle(0x3b2821, 1); g.fillRect(16, 12, 48, 56);
      g.fillStyle(0x8b5a39, 1); g.fillRect(20, 18, 40, 4); g.fillRect(20, 36, 40, 4); g.fillRect(20, 54, 40, 4);
      g.fillStyle(0x6d8a72, 1); g.fillRect(24, 24, 9, 11); g.fillStyle(0x9a6a45, 1); g.fillRect(38, 24, 8, 11); g.fillStyle(0x6d6a8f, 1); g.fillRect(50, 24, 7, 11);
      g.fillStyle(0x9b6b48, 1); g.fillRect(25, 42, 8, 11); g.fillStyle(0x718b66, 1); g.fillRect(38, 42, 9, 11); g.fillStyle(0x9b7b56, 1); g.fillRect(51, 42, 7, 11);
    });
    makeTexture("cafe-counter", (g) => {
      g.fillStyle(0x3a251e, 1); g.fillRoundedRect(6, 20, 68, 34, 7);
      g.fillStyle(0x8d5735, 1); g.fillRoundedRect(8, 17, 64, 20, 5);
      g.fillStyle(0xb77b43, 1); g.fillRect(12, 18, 56, 5);
      g.fillStyle(0x4d3328, 1); g.fillRect(15, 40, 50, 9);
    });
    makeTexture("cafe-lamp", (g) => {
      g.fillStyle(0x2f2522, 1); g.fillRect(38, 8, 4, 18);
      g.fillStyle(0xf0c86e, 1); g.fillCircle(40, 35, 12);
      g.fillStyle(0xffe9a6, 0.22); g.fillCircle(40, 35, 25);
    });
    makeTexture("cafe-rug", (g) => {
      g.fillStyle(0x634a43, 1); g.fillRoundedRect(8, 22, 64, 36, 8);
      g.lineStyle(3, 0xb1876d, 1); g.strokeRoundedRect(12, 26, 56, 28, 6);
    });

    const sprite = (key: string, x: number, y: number, scale = 1) =>
      this.add.sprite((x + 0.5) * tileSize, (y + 0.5) * tileSize, key)
        .setScale(scale).setDepth(DEPTH_SPACE + y + 1);

    // Furniture occupies the blocked cells from collision.json.
    [[6,7],[12,7],[6,12],[12,12],[18,12]].forEach(([x,y]) => sprite("cafe-table", x, y));
    [[5,6.1],[7,6.1],[5,8.5],[7,8.5],[11,6.1],[13,6.1],[11,8.5],[13,8.5],
      [5,11.1],[7,11.1],[5,13.5],[7,13.5],[11,11.1],[13,11.1],[11,13.5],[13,13.5],
      [17,11.1],[19,11.1],[17,13.5],[19,13.5]].forEach(([x,y]) => sprite("cafe-chair", x, y, .8));
    sprite("cafe-counter", 22, 4, 1.15);
    sprite("cafe-shelf", 22, 9, .9);
    sprite("cafe-sofa", 4, 15, 1.0);
    sprite("cafe-sofa", 22, 15, 1.0);
    sprite("cafe-plant", 2, 4, .9);
    sprite("cafe-plant", 26, 16, .9);
    sprite("cafe-lamp", 4, 3, .85);
    sprite("cafe-lamp", 14, 3, .85);
    sprite("cafe-lamp", 24, 3, .85);
    sprite("cafe-rug", 14, 10, 1.5);
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
    this.pauseMovement();
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

    this.setCurrentInteractionTarget(null);
  }

  private isNearTablet(): boolean {
    const tile = this.movement.tile;
    return Math.abs(tile.x - TABLET_TILE.x) + Math.abs(tile.y - TABLET_TILE.y) <= 1;
  }

  private setCurrentInteractionTarget(target: InteractionTarget | null): void {
    this.interactionTarget = target;
    // Interaction is now communicated by the mobile A button / keyboard controls.
    // Do not render a bottom-screen hint because it overlaps the mobile action buttons.
    void target;
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
