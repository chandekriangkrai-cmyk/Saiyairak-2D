import {
  BACKEND_URL,
  createRoom,
  http,
  joinSpace,
  makeAdmin,
  makeUser,
  nextOfType,
  openSocket,
  sendWs,
  sleep,
  type Socket,
  type TestUser,
} from "./helpers";

describe("Websocket movement", () => {
  let user1: TestUser;
  let user2: TestUser;
  let spaceId = "";
  let s1: Socket;
  let s2: Socket;

  beforeAll(async () => {
    user1 = await makeAdmin("ws");
    user2 = await makeUser("ws");
    const room = await createRoom(user1.token, "WS room");
    spaceId = room.spaceId;

    s1 = await openSocket();
    s2 = await openSocket();

    joinSpace(s1.ws, spaceId, user1.token);
    await nextOfType(s1.messages, "space-joined");
    joinSpace(s2.ws, spaceId, user2.token);
    await nextOfType(s2.messages, "space-joined");
    await nextOfType(s1.messages, "user-joined");
  });

  afterAll(() => {
    try {
      s1?.ws.close();
    } catch {}
    try {
      s2?.ws.close();
    } catch {}
  });

  test("Leaving broadcasts a user-left event with identity", async () => {
    s1.ws.close();
    const message = await nextOfType(s2.messages, "user-left");
    expect(message).not.toBeNull();
    expect(message.payload.userId).toBe(user1.userId);
    expect(message.payload.id).toBeDefined();
  });

  test("Malformed frames are ignored and the connection stays usable", async () => {
    const s3 = await openSocket();
    s3.ws.send("this is not json at all");
    s3.ws.send(JSON.stringify({ type: "unknown-op", payload: { foo: 1 } }));
    await sleep(50);

    joinSpace(s3.ws, spaceId, user2.token);
    const joined = await nextOfType(s3.messages, "space-joined");
    expect(joined).not.toBeNull();
    s3.ws.close();
  });
});

test("Classroom aisle accepts moves while the teacher desk remains solid", async () => {
  const { data } = await http.get(`${BACKEND_URL}/api/v1/space/official`);
  const classroom = data.spaces.find((space: { code: string }) => space.code === "CLASS01");
  const walker = await makeUser("classroom-walker");
  const observer = await makeUser("classroom-observer");
  const mover = await openSocket();
  const peer = await openSocket();
  try {
    joinSpace(mover.ws, classroom.id, walker.token);
    expect((await nextOfType(mover.messages, "space-joined")).payload.spawn).toEqual({ x: 18, y: 14 });
    joinSpace(peer.ws, classroom.id, observer.token);
    await nextOfType(peer.messages, "space-joined");

    // The legacy server grid blocked row 19 in this otherwise open aisle.
    const aisle = [15, 16, 17, 18, 19, 20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10];
    for (const y of aisle) sendWs(mover.ws, "move", { x: 18, y });
    sendWs(mover.ws, "move", { x: 18, y: 9 });
    const rejection = await nextOfType(mover.messages, "movement-rejected");
    expect(rejection?.payload).toEqual({ x: 18, y: 10 });
    expect(mover.messages.some(message => message.type === "movement-rejected")).toBe(false);
    for (const y of aisle) {
      const observed = await nextOfType(peer.messages, "movement");
      expect(observed?.payload).toMatchObject({ userId: walker.userId, x: 18, y });
    }
    expect(peer.messages.some(message => message.type === "movement")).toBe(false);
  } finally {
    mover.ws.close();
    peer.ws.close();
  }
});
