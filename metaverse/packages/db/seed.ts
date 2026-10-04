import client from "./client";
import { createLogger } from "@repo/logger";

const logger = createLogger({ service: "seed" });

const avatars = [
  { name: "Wick", imageUrl: "/avatars/wick.png" },
  { name: "Dai", imageUrl: "/avatars/dai.png" },
  { name: "Mimi", imageUrl: "/avatars/mimi.png" },
];

const GARDEN_LIBRARY_IMAGE = "/assets/spaces/garden-library/gardenlibspace.png";
const libraryMap = {
  name: "Study Library",
  width: 43,
  height: 24,
  thumbnail: GARDEN_LIBRARY_IMAGE,
  mapImage: GARDEN_LIBRARY_IMAGE,
};

const MULTIROOM_HOUSE_IMAGE = "/assets/spaces/multiroom-house/space.png";
const multiroomHouseMap = {
  name: "Multi-room House",
  width: 26,
  height: 26,
  thumbnail: MULTIROOM_HOUSE_IMAGE,
  mapImage: MULTIROOM_HOUSE_IMAGE,
};

const VIRTUAL_OFFICE_IMAGE = "/assets/spaces/virtual-office/space.png";
const virtualOfficeMap = {
  name: "Virtual Office",
  width: 39,
  height: 26,
  thumbnail: VIRTUAL_OFFICE_IMAGE,
  mapImage: VIRTUAL_OFFICE_IMAGE,
};

const CLASSROOM_IMAGE = "/assets/spaces/classroom/classroom.png";
const classroomMap = {
  name: "Classroom",
  width: 37,
  height: 28,
  thumbnail: CLASSROOM_IMAGE,
  mapImage: CLASSROOM_IMAGE,
};

const HIDE_AND_SEEK_IMAGE = "/assets/spaces/hide-and-seek/space.webp";
const hideAndSeekMap = {
  name: "Enchanted Forest Hide & Seek",
  width: 57,
  height: 57,
  thumbnail: HIDE_AND_SEEK_IMAGE,
  mapImage: HIDE_AND_SEEK_IMAGE,
};

const templateMaps = [
  libraryMap,
  multiroomHouseMap,
  virtualOfficeMap,
  classroomMap,
  hideAndSeekMap,
];

const officialSpaces = [
  { code: "LIBRARY", map: libraryMap },
  { code: "HOUSE01", map: multiroomHouseMap },
  { code: "OFFICE1", map: virtualOfficeMap },
  { code: "CLASS01", map: classroomMap },
  { code: "FOREST1", map: hideAndSeekMap },
];

async function main() {
  for (const avatar of avatars) {
    const existing = await client.avatar.findFirst({
      where: { name: avatar.name },
    });
    if (existing) continue;
    await client.avatar.create({ data: avatar });
    logger.info({ avatar: avatar.name }, "avatar created");
  }

  const maps = new Map<string, Awaited<ReturnType<typeof client.map.create>>>();
  for (const template of templateMaps) {
    const existing = await client.map.findFirst({
      where: { name: template.name },
    });
    const map = existing
      ? await client.map.update({
          where: { id: existing.id },
          data: template,
        })
      : await client.map.create({ data: template });
    logger.info({ map: map.name, created: !existing }, "map upserted");
    maps.set(template.name, map);
  }

  let system = await client.user.findUnique({
    where: { username: "system" },
  });
  if (!system) {
    system = await client.user.create({
      data: {
        username: "system",
        password: "!locked",
        role: "Admin",
      },
    });
  }

  // Keep every built-in learning space available from the dashboard.
  // The previous seed only created Study Library, even though all five
  // templates were already present and supported by the Phaser client.
  for (const officialSpace of officialSpaces) {
    const map = maps.get(officialSpace.map.name)!;
    const spaceData = {
      name: officialSpace.map.name,
      width: map.width,
      height: map.height,
      thumbnail: map.thumbnail,
      mapImage: map.mapImage,
      official: true,
      creatorId: system.id,
    };

    const existing = await client.space.findUnique({
      where: { code: officialSpace.code },
    });

    if (existing) {
      await client.space.update({
        where: { id: existing.id },
        data: spaceData,
      });
      logger.info(
        { code: officialSpace.code, name: officialSpace.map.name },
        "official space updated",
      );
    } else {
      await client.space.create({
        data: {
          ...spaceData,
          code: officialSpace.code,
        },
      });
      logger.info(
        { code: officialSpace.code, name: officialSpace.map.name },
        "official space created",
      );
    }
  }
}

main()
  .then(() => {
    logger.info("seed complete");
    process.exit(0);
  })
  .catch((e) => {
    logger.fatal({ err: e }, "seed failed");
    process.exit(1);
  });
