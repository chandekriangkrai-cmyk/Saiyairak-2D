import Phaser from "phaser";
import type { Direction } from "../systems/GridMovement";
import type { WokaAppearance } from "../woka/wokaConfig";
import { Woka } from "./Woka";

export const CHARACTER_HEIGHT_TILES = 1.4;

const LABEL_STYLE = {
  fontFamily: '"JetBrains Mono", monospace',
  fontSize: "10px",
  color: "#e9eaf6",
  backgroundColor: "#14162bcc",
  padding: { x: 3, y: 1 },
};

const CHAT_BUBBLE_STYLE = {
  fontFamily: '"JetBrains Mono", monospace',
  fontSize: "11px",
  color: "#14162b",
  backgroundColor: "#f8f8ff",
  padding: { x: 6, y: 4 },
  align: "center" as const,
};

const CHAT_BUBBLE_DURATION = 4500;
const CHAT_BUBBLE_MAX_WIDTH = 180;

export class Player extends Phaser.GameObjects.Container {
  private woka: Woka;
  private label: Phaser.GameObjects.Text;
  private timer: Phaser.GameObjects.Text | null = null;
  private chatBubble: Phaser.GameObjects.Text | null = null;
  private chatBubbleTimer: Phaser.Time.TimerEvent | null = null;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    tileSize: number,
    appearance?: WokaAppearance,
  ) {
    super(scene, x, y);

    this.woka = new Woka(scene, tileSize, appearance);
    this.label = scene.add
      .text(0, 0, "", LABEL_STYLE)
      .setOrigin(0.5, 1)
      .setResolution(2);
    this.add([this.woka, this.label]);

    this.faceIdle("down");
    this.layoutLabels();
    scene.add.existing(this);
  }

  setDisplayName(name: string): void {
    this.label.setText(name.trim() || "player");
    this.layoutLabels();
  }

  setTimer(text: string | null): void {
    if (text === null) {
      this.timer?.setVisible(false);
      this.layoutLabels();
      return;
    }
    if (!this.timer) {
      this.timer = this.scene.add
        .text(0, 0, "", { ...LABEL_STYLE, color: "#ffc53d" })
        .setOrigin(0.5, 1)
        .setResolution(2);
      this.add(this.timer);
    }
    this.timer.setText(`< ${text} >`).setVisible(true);
    this.layoutLabels();
  }

  showChatBubble(message: string, duration = CHAT_BUBBLE_DURATION): void {
    const text = message.trim();
    if (!text) return;

    if (!this.chatBubble) {
      this.chatBubble = this.scene.add
        .text(0, 0, "", CHAT_BUBBLE_STYLE)
        .setOrigin(0.5, 1)
        .setResolution(2)
        .setDepth(2);
      this.chatBubble.setWordWrapWidth(CHAT_BUBBLE_MAX_WIDTH, true);
      this.add(this.chatBubble);
    }

    this.chatBubble.setText(text).setVisible(true);
    this.chatBubbleTimer?.remove(false);
    this.chatBubbleTimer = this.scene.time.delayedCall(duration, () => {
      this.chatBubble?.setVisible(false);
      this.chatBubbleTimer = null;
      this.layoutLabels();
    });
    this.layoutLabels();
  }

  setAppearance(appearance: WokaAppearance): void {
    this.woka.setAppearance(appearance);
  }

  playWalk(dir: Direction): void {
    this.woka.playWalk(dir);
  }

  faceIdle(dir: Direction): void {
    this.woka.faceIdle(dir);
  }

  destroy(fromScene?: boolean): void {
    this.chatBubbleTimer?.remove(false);
    this.chatBubbleTimer = null;
    super.destroy(fromScene);
  }

  private layoutLabels(): void {
    const top = -this.woka.wokaHeight - 4;
    this.label.setY(top);

    let anchor = top - this.label.height - 2;
    if (this.timer?.visible) {
      this.timer.setY(anchor);
      anchor -= this.timer.height + 3;
    } else {
      this.timer?.setY(anchor);
    }

    if (this.chatBubble) {
      this.chatBubble.setY(anchor);
    }
  }
}
