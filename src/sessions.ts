import * as fs from "fs/promises";
import { existsSync, mkdirSync } from "fs";
import * as path from "path";
import { SESSIONS_SUBDIR } from "./constants";
import type { Session, Content } from "./types";

function getSessionsDir(worktree: string): string {
  return path.join(worktree, SESSIONS_SUBDIR);
}

function getSessionPath(sessionId: string, worktree: string): string {
  const safeId = sessionId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(getSessionsDir(worktree), `${safeId}.json`);
}

export async function loadSession(
  sessionId: string,
  worktree: string
): Promise<Session | null> {
  const sessionPath = getSessionPath(sessionId, worktree);

  if (!existsSync(sessionPath)) {
    return null;
  }

  try {
    const content = await fs.readFile(sessionPath, "utf-8");
    return JSON.parse(content) as Session;
  } catch {
    return null;
  }
}

export async function saveSession(
  session: Session,
  worktree: string
): Promise<void> {
  const sessionsDir = getSessionsDir(worktree);

  if (!existsSync(sessionsDir)) {
    mkdirSync(sessionsDir, { recursive: true });
  }

  const sessionPath = getSessionPath(session.id, worktree);
  session.updatedAt = Date.now();

  await fs.writeFile(sessionPath, JSON.stringify(session, null, 2), "utf-8");
}

export function createSession(sessionId: string): Session {
  return {
    id: sessionId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    history: [],
  };
}

export function addMessageToSession(
  session: Session,
  role: "user" | "model",
  parts: Content["parts"]
): void {
  session.history.push({ role, parts });
  session.updatedAt = Date.now();
}

export function getSessionHistory(session: Session): Content[] {
  return session.history;
}

export async function listSessions(worktree: string): Promise<string[]> {
  const sessionsDir = getSessionsDir(worktree);

  if (!existsSync(sessionsDir)) {
    return [];
  }

  try {
    const files = await fs.readdir(sessionsDir);
    return files
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(".json", ""));
  } catch {
    return [];
  }
}

export async function deleteSession(
  sessionId: string,
  worktree: string
): Promise<boolean> {
  const sessionPath = getSessionPath(sessionId, worktree);

  if (!existsSync(sessionPath)) {
    return false;
  }

  try {
    await fs.unlink(sessionPath);
    return true;
  } catch {
    return false;
  }
}
