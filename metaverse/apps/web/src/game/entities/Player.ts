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

export class Player extends Phaser.GameObjects.Container {
  private woka: Woka;
  private label: Phaser.GameObjects.Text;
  private timer: Phaser.GameObjects.Text | null = null;
  private speechBubble: Phaser.GameObjects.Container | null = null;
  private speechTimer: Phaser.Time.TimerEvent | null = null;

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

  setAppearance(appearance: WokaAppearance): void {
    this.woka.setAppearance(appearance);
  }

  showSpeech(text: string, durationMs = 4500): void {
    const message = text.trim().slice(0, 500);
    if (!message) return;

    this.speechTimer?.remove(false);
    this.speechTimer = null;
    this.speechBubble?.destroy();

    const bubble = this.scene.add.container(0, 0);
    const bubbleText = this.scene.add.text(0, 0, message, {
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: "11px",
      color: "#15182a",
      backgroundColor: "#fffdf5",
      padding: { x: 8, y: 6 },
      wordWrap: { width: 190, useAdvancedWrap: true },
      align: "center",
      stroke: "#15182a",
      strokeThickness: 1,
    }).setOrigin(0.5, 1).setResolution(2);

    const width = Math.min(Math.max(bubbleText.width + 2, 44), 210);
    const height = bubbleText.height + 2;
    const panel = this.scene.add.graphics();
    panel.fillStyle(0xfffdf5, 1);
    panel.lineStyle(2, 0x15182a, 1);
    panel.fillRoundedRect(-width / 2, -height, width, height, 7);
    panel.strokeRoundedRect(-width / 2, -height, width, height, 7);
    panel.fillTriangle(-6, 0, 6, 0, 0, 8);
    panel.lineBetween(-6, 0, 0, 8);
    panel.lineBetween(0, 8, 6, 0);

    bubbleText.setPosition(0, -2);
    bubble.add([panel, bubbleText]);
    bubble.setPosition(0, -this.woka.wokaHeight - this.label.height - 12);
    bubble.setDepth(50);
    this.add(bubble);
    this.speechBubble = bubble;

    this.speechTimer = this.scene.time.delayedCall(durationMs, () => {
      this.speechBubble?.destroy();
      this.speechBubble = null;
      this.speechTimer = null;
    });
  }

  playWalk(dir: Direction): void {
    this.woka.playWalk(dir);
  }

  faceIdle(dir: Direction): void {
    this.woka.faceIdle(dir);
  }

  private layoutLabels(): void {
    const top = -this.woka.wokaHeight - 4;
    this.label.setY(top);
    this.timer?.setY(top - this.label.height - 1);
    if (this.speechBubble) {
      this.speechBubble.setY(top - this.label.height - (this.timer?.visible ? this.timer.height + 1 : 0) - 8);
    }
  }

  override destroy(fromScene?: boolean): void {
    this.speechTimer?.remove(false);
    this.speechTimer = null;
    this.speechBubble?.destroy();
    this.speechBubble = null;
    super.destroy(fromScene);
  }
}
