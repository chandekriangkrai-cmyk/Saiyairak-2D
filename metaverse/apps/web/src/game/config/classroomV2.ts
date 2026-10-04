import type { TileCoord, TileRect } from "./spaces";

/**
 * Classroom V2 is designed around Styloo's 2D School Classroom Asset Pack.
 * The pack is CC0 and contains 3000+ transparent PNG sprites in 8 directions.
 *
 * Keep gameplay coordinates independent from sprite filenames so the art pack
 * can be replaced/reorganized without rewriting movement or interaction code.
 */
export const CLASSROOM_V2_ASSET_ROOT =
  "/assets/classroom-v2/source/2dClassroomAssetPackByStyloo";

/** Curated pack paths. Keep these explicit so missing/renamed art fails visibly
 * instead of silently falling back to placeholder atlas names. */
export const CLASSROOM_V2_ASSETS = {
  classroom: Array.from({ length: 8 }, (_, i) =>
    `${CLASSROOM_V2_ASSET_ROOT}/Classroom/Classroom First Spritesheet ${i + 1}.png`,
  ),
  classroomSecond: Array.from({ length: 8 }, (_, i) =>
    `${CLASSROOM_V2_ASSET_ROOT}/Classroom/Classroom Second Spritesheet ${i + 1}.png`,
  ),
  tiling: `${CLASSROOM_V2_ASSET_ROOT}/WallFloorDoor second version tiling`,
} as const;

export type ClassroomObjectKind =
  | "board"
  | "teacher-desk"
  | "student-desk"
  | "bookshelf"
  | "computer"
  | "door"
  | "window"
  | "bin"
  | "decoration";

export type ClassroomObject = {
  id: string;
  kind: ClassroomObjectKind;
  tile: TileCoord;
  size?: { w: number; h: number };
  blocked?: boolean;
  interaction?: string;
};

export type ClassroomZone = {
  id: string;
  rect: TileRect;
  activity: string;
};

/** First playable classroom template. Coordinates are intentionally compact
 * and can be tuned after the real sprite pack is imported. */
export const CLASSROOM_V2_OBJECTS: ClassroomObject[] = [
  { id: "board-main", kind: "board", tile: { x: 8, y: 2 }, size: { w: 8, h: 1 }, interaction: "open-board" },
  { id: "teacher-desk", kind: "teacher-desk", tile: { x: 10, y: 4 }, size: { w: 2, h: 1 }, blocked: true, interaction: "teacher-zone" },
  { id: "desk-01", kind: "student-desk", tile: { x: 4, y: 7 }, size: { w: 2, h: 1 }, blocked: true, interaction: "student-seat" },
  { id: "desk-02", kind: "student-desk", tile: { x: 8, y: 7 }, size: { w: 2, h: 1 }, blocked: true, interaction: "student-seat" },
  { id: "desk-03", kind: "student-desk", tile: { x: 12, y: 7 }, size: { w: 2, h: 1 }, blocked: true, interaction: "student-seat" },
  { id: "desk-04", kind: "student-desk", tile: { x: 4, y: 11 }, size: { w: 2, h: 1 }, blocked: true, interaction: "student-seat" },
  { id: "desk-05", kind: "student-desk", tile: { x: 8, y: 11 }, size: { w: 2, h: 1 }, blocked: true, interaction: "student-seat" },
  { id: "desk-06", kind: "student-desk", tile: { x: 12, y: 11 }, size: { w: 2, h: 1 }, blocked: true, interaction: "student-seat" },
  { id: "bookshelf-left", kind: "bookshelf", tile: { x: 2, y: 5 }, size: { w: 1, h: 4 }, blocked: true, interaction: "bookshelf" },
  { id: "bookshelf-right", kind: "bookshelf", tile: { x: 17, y: 5 }, size: { w: 1, h: 4 }, blocked: true, interaction: "bookshelf" },
  { id: "computer", kind: "computer", tile: { x: 16, y: 11 }, size: { w: 2, h: 1 }, blocked: true, interaction: "computer" },
  { id: "exit", kind: "door", tile: { x: 10, y: 15 }, interaction: "exit-classroom" },
];

export const CLASSROOM_V2_ZONES: ClassroomZone[] = [
  { id: "teacher", rect: { x: 7, y: 3, w: 7, h: 3 }, activity: "lesson" },
  { id: "students", rect: { x: 3, y: 6, w: 12, h: 7 }, activity: "group-learning" },
  { id: "library", rect: { x: 1, y: 4, w: 3, h: 7 }, activity: "vocabulary" },
  { id: "computer-lab", rect: { x: 15, y: 9, w: 4, h: 4 }, activity: "digital-learning" },
];

export const CLASSROOM_V2_SPRITES = {
  primary: CLASSROOM_V2_ASSETS.classroom[0],
  secondary: CLASSROOM_V2_ASSETS.classroomSecond[0],
} as const;
