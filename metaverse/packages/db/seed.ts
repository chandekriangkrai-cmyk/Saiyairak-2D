import { randomBytes, scrypt } from "node:crypto";
import client from "./client";
import { createLogger } from "@repo/logger";

const logger = createLogger({ service: "seed" });

const avatars = [
  { name: "Wick", imageUrl: "/avatars/wick.png" },
  { name: "Dai", imageUrl: "/avatars/dai.png" },
  { name: "Mimi", imageUrl: "/avatars/mimi.png" },
];

const GARDEN_LIBRARY_IMAGE = "/assets/spaces/garden-library/gardenlibspace.png";
const libraryMap = { name: "Study Library", width: 43, height: 24, thumbnail: GARDEN_LIBRARY_IMAGE, mapImage: GARDEN_LIBRARY_IMAGE };
const MULTIROOM_HOUSE_IMAGE = "/assets/spaces/multiroom-house/space.png";
const multiroomHouseMap = { name: "Multi-room House", width: 26, height: 26, thumbnail: MULTIROOM_HOUSE_IMAGE, mapImage: MULTIROOM_HOUSE_IMAGE };
const VIRTUAL_OFFICE_IMAGE = "/assets/spaces/virtual-office/space.png";
const virtualOfficeMap = { name: "Virtual Office", width: 39, height: 26, thumbnail: VIRTUAL_OFFICE_IMAGE, mapImage: VIRTUAL_OFFICE_IMAGE };
const CLASSROOM_IMAGE = "/assets/spaces/classroom/original-classroom.png";
const classroomMap = { name: "Classroom", width: 37, height: 28, thumbnail: CLASSROOM_IMAGE, mapImage: CLASSROOM_IMAGE };
const HIDE_AND_SEEK_IMAGE = "/assets/spaces/hide-and-seek/space.webp";
const hideAndSeekMap = { name: "Enchanted Forest Hide & Seek", width: 57, height: 57, thumbnail: HIDE_AND_SEEK_IMAGE, mapImage: HIDE_AND_SEEK_IMAGE };
const templateMaps = [libraryMap, multiroomHouseMap, virtualOfficeMap, classroomMap, hideAndSeekMap];
const officialSpaces = [
  { code: "LIBRARY", map: libraryMap },
  { code: "HOUSE01", map: multiroomHouseMap },
  { code: "OFFICE1", map: virtualOfficeMap },
  { code: "CLASS01", map: classroomMap },
  { code: "FOREST1", map: hideAndSeekMap },
];

async function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = randomBytes(16).toString("hex");
    scrypt(password, salt, 32, (error, derivedKey) => {
      if (error) return reject(error);
      resolve(`${salt}.${derivedKey.toString("hex")}`);
    });
  });
}

async function main() {
  for (const avatar of avatars) {
    const existing = await client.avatar.findFirst({ where: { name: avatar.name } });
    if (!existing) await client.avatar.create({ data: avatar });
  }

  // Remove the deprecated Cafe official room and its reusable map template.
  const cafeSpace = await client.space.findUnique({ where: { code: "CAFE01" } });
  if (cafeSpace) {
    await client.spaceElements.deleteMany({ where: { spaceId: cafeSpace.id } });
    await client.space.delete({ where: { id: cafeSpace.id } });
  }

  const cafeMap = await client.map.findFirst({ where: { name: "Cozy Cafe" } });
  if (cafeMap) {
    await client.mapElements.deleteMany({ where: { mapId: cafeMap.id } });
    await client.map.delete({ where: { id: cafeMap.id } });
  }

  const maps = new Map<string, Awaited<ReturnType<typeof client.map.create>>>();
  for (const template of templateMaps) {
    const existing = await client.map.findFirst({ where: { name: template.name } });
    const map = existing
      ? await client.map.update({ where: { id: existing.id }, data: template })
      : await client.map.create({ data: template });
    maps.set(template.name, map);
  }

  let system = await client.user.findUnique({ where: { username: "system" } });
  if (!system) {
    system = await client.user.create({ data: { username: "system", password: "!locked", role: "Admin" } });
  }

  const teacherUsername = process.env.TEACHER_USERNAME?.trim() || "teacher";
  const teacherPassword = process.env.TEACHER_PASSWORD || "SchoolTimeTeacher2026!";
  let teacher = await client.user.findUnique({ where: { username: teacherUsername } });
  if (!teacher) {
    teacher = await client.user.create({
      data: { username: teacherUsername, password: await hashPassword(teacherPassword), role: "Teacher" },
    });
    logger.info({ username: teacherUsername }, "teacher account created");
  } else if (teacher.role !== "Teacher") {
    teacher = await client.user.update({ where: { id: teacher.id }, data: { role: "Teacher" } });
  }

  for (const officialSpace of officialSpaces) {
    const map = maps.get(officialSpace.map.name)!;
    const spaceData = {
      name: officialSpace.map.name,
      width: map.width,
      height: map.height,
      thumbnail: map.thumbnail,
      mapImage: map.mapImage,
      official: true,
      creatorId: teacher.id,
    };
    const existing = await client.space.findUnique({ where: { code: officialSpace.code } });
    if (existing) {
      await client.space.update({ where: { id: existing.id }, data: spaceData });
    } else {
      await client.space.create({ data: { ...spaceData, code: officialSpace.code } });
    }
  }

  logger.info({ teacher: teacherUsername }, "seed complete");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    logger.fatal({ err: e }, "seed failed");
    process.exit(1);
  });
