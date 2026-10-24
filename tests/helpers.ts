import { execFileSync } from "node:child_process";
import path from "node:path";
import axios2 from "axios";

export const BACKEND_URL = "http://localhost:3000";
export const WS_URL = "ws://localhost:3001";
export const TEST_PASSWORD = "integration-test-pw";

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const http = {
  post: async (...args: any[]) => {
    try {
      return await (axios2.post as any)(...args);
    } catch (e: any) {
      return e.response;
    }
  },
  get: async (...args: any[]) => {
    try {
      return await (axios2.get as any)(...args);
    } catch (e: any) {
      return e.response;
    }
  },
  put: async (...args: any[]) => {
    try {
      return await (axios2.put as any)(...args);
    } catch (e: any) {
      return e.response;
    }
  },
  delete: async (...args: any[]) => {
    try {
      return await (axios2.delete as any)(...args);
    } catch (e: any) {
      return e.response;
    }
  },
};

export function authHeader(token: string) {
  return { headers: { authorization: `Bearer ${token}` } };
}

export type TestUser = { username: string; userId: string; token: string };

export async function makeUser(prefix = "user"): Promise<TestUser> {
  const username = `${prefix}-${Math.random()}`;
  const password = TEST_PASSWORD;
  const signup = await http.post(`${BACKEND_URL}/api/v1/signup`, {
    username,
    password,
    type: "user",
  });
  const signin = await http.post(`${BACKEND_URL}/api/v1/signin`, {
    username,
    password,
  });
  return {
    username,
    userId: signup.data.userId as string,
    token: signin.data.token as string,
  };
}

// Room creation is admin-only. Provision only explicit test administrators,
// and refuse database mutations against non-local environments.
export async function makeAdmin(prefix = "admin"): Promise<TestUser> {
  const databaseUrl = process.env.DATABASE_URL;
  if (
    !databaseUrl ||
    !["localhost", "127.0.0.1", "[::1]"].includes(new URL(databaseUrl).hostname)
  ) {
    throw new Error(
      "Admin fixtures require DATABASE_URL for a local test database",
    );
  }
  const user = await makeUser(prefix);
  execFileSync(
    "bun",
    [
      "-e",
      `
    import client from "./packages/db/client.ts";
    await client.user.update({where: {id: process.argv[1]}, data: {role: "Admin"}});
    await client.$disconnect();
    process.exit(0);
  `,
      user.userId,
    ],
    { cwd: path.resolve(__dirname, "../metaverse"), timeout: 10000 },
  );
  const signin = await http.post(`${BACKEND_URL}/api/v1/signin`, {
    username: user.username,
    password: TEST_PASSWORD,
  });
  if (signin.status !== 200) throw new Error("Admin fixture signin failed");
  return { ...user, token: signin.data.token };
}

export async function getLibraryMapId(): Promise<string> {
  const response = await http.get(`${BACKEND_URL}/api/v1/maps`);
  return response.data.maps.find((m: any) => m.name === "Study Library").id;
}

export async function getMapIdByName(name: string): Promise<string> {
  const response = await http.get(`${BACKEND_URL}/api/v1/maps`);
  return response.data.maps.find((m: any) => m.name === name).id;
}

export async function createVideoRoom(
  token: string,
  name = "Video room",
): Promise<{ spaceId: string; code: string }> {
  const mapId = await getMapIdByName("Virtual Office");
  const response = await http.post(
    `${BACKEND_URL}/api/v1/space`,
    { name, mapId },
    authHeader(token),
  );
  return { spaceId: response.data.spaceId, code: response.data.code };
}

export async function createRoom(
  token: string,
  name = "Test room",
): Promise<{ spaceId: string; code: string }> {
  const mapId = await getLibraryMapId();
  const response = await http.post(
    `${BACKEND_URL}/api/v1/space`,
    { name, mapId },
    authHeader(token),
  );
  return { spaceId: response.data.spaceId, code: response.data.code };
}

export type Socket = { ws: WebSocket; messages: any[] };

export function openSocket(): Promise<Socket> {
  const ws = new WebSocket(WS_URL);
  const messages: any[] = [];
  ws.onmessage = (event: any) => messages.push(JSON.parse(event.data));
  return new Promise((resolve) => {
    (ws as any).onopen = () => resolve({ ws, messages });
  });
}

export function sendWs(ws: WebSocket, type: string, payload: unknown) {
  ws.send(JSON.stringify({ type, payload }));
}

export function joinSpace(ws: WebSocket, spaceId: string, token: string) {
  sendWs(ws, "join", { spaceId, token });
}

export async function nextOfType(
  messages: any[],
  type: string,
  timeoutMs = 3000,
): Promise<any> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const idx = messages.findIndex((m) => m.type === type);
    if (idx >= 0) return messages.splice(idx, 1)[0];
    await sleep(20);
  }
  return null;
}

export function waitForClose(
  ws: WebSocket,
  timeoutMs = 3000,
): Promise<{ code: number } | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeoutMs);
    (ws as any).onclose = (event: any) => {
      clearTimeout(timer);
      resolve({ code: event.code });
    };
  });
}

export async function nextMessage(
  messages: any[],
  timeoutMs = 3000,
): Promise<any> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (messages.length) return messages.shift();
    await sleep(20);
  }
  return null;
}
