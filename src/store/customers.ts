import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";

type CustomerMap = Record<string, string>;

async function readMap(): Promise<CustomerMap> {
  try {
    const raw = await readFile(config.customerMapPath, "utf8");
    return JSON.parse(raw) as CustomerMap;
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === "ENOENT") return {};
    throw error;
  }
}

async function writeMap(map: CustomerMap): Promise<void> {
  const dir = path.dirname(config.customerMapPath);
  await mkdir(dir, { recursive: true });
  await writeFile(config.customerMapPath, JSON.stringify(map, null, 2), "utf8");
}

export async function getMappedCustomerId(
  slackUserId: string,
): Promise<string | undefined> {
  const map = await readMap();
  return map[slackUserId];
}

export async function setMappedCustomerId(
  slackUserId: string,
  billingCustomerId: string,
): Promise<void> {
  const map = await readMap();
  map[slackUserId] = billingCustomerId;
  await writeMap(map);
}
