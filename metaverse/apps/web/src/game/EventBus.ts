import Phaser from "phaser";

export const EventBus = new Phaser.Events.EventEmitter();

export const SpaceEvent = {
  SceneReady: "space:scene-ready",
  PlayerName: "space:player-name",
  PlayerAppearance: "space:player-appearance",
  MoveDirection: "space:move-direction",
  SchoolTimeInteract: "school-time:interact",
  SchoolTimeAction: "school-time:action",
  ZoomIn: "zoom:in",
  ZoomOut: "zoom:out",
} as const;
