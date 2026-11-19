import { expect, test } from "bun:test";
import type Phaser from "phaser";
import { CollisionGrid } from "./CollisionGrid";
import { GridMovement } from "./GridMovement";

function setup(start = { x: 1, y: 1 }) {
  const grid = new CollisionGrid(4, 4);
  const tiles: { x: number; y: number }[] = [];
  const idle: string[] = [];
  const target = { setPosition() {} } as unknown as Phaser.GameObjects.Container;
  const movement = new GridMovement({} as Phaser.Scene, grid, target, 40, start, {
    onTileChange: () => tiles.push(movement.tile),
    onIdle: (direction) => idle.push(direction),
  });
  return { grid, movement, tiles, idle };
}

test("first vertical tile crossings are symmetric and reported immediately", () => {
  const { movement, tiles, idle } = setup();
  movement.update("up", 100);
  expect(movement.tile).toEqual({ x: 1, y: 1 });
  movement.update("up", 20);
  expect(tiles).toEqual([{ x: 1, y: 0 }]);
  movement.forceSetTile({ x: 1, y: 1 });
  expect(idle).toEqual(["up"]);
  movement.update("down", 100);
  expect(movement.tile).toEqual({ x: 1, y: 1 });
  movement.update("down", 20);
  expect(tiles).toEqual([{ x: 1, y: 0 }, { x: 1, y: 2 }]);
});

test("long frames cannot skip furniture and movement can turn away from it", () => {
  const { grid, movement, tiles } = setup();
  grid.setBlocked(2, 1, true);
  movement.update("right", 600);
  movement.update("right", 600);
  expect(movement.moving).toBe(false);
  expect(tiles).toEqual([]);
  movement.update("down", 600);
  movement.update("down", 600);
  expect(tiles).toEqual([{ x: 1, y: 2 }]);
});
