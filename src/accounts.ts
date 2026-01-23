import * as fs from "fs/promises";
import { existsSync } from "fs";
import { dirname } from "path";
import { CONFIG_PATHS, RATE_LIMIT_KEY_PREFIX } from "./constants";
import type { Account, AccountsConfig } from "./types";

export async function findConfigPath(): Promise<string | null> {
  for (const configPath of CONFIG_PATHS) {
    if (existsSync(configPath)) {
      return configPath;
    }
  }
  return null;
}

export async function loadAccounts(): Promise<AccountsConfig | null> {
  const envToken = process.env.ANTIGRAVITY_REFRESH_TOKEN;
  
  const configPath = await findConfigPath();
  if (!configPath) {
    if (envToken) {
       return {
        version: 1,
        activeIndex: 0,
        accounts: [{
          refreshToken: envToken,
          email: "env-user@ci",
          lastUsed: 0,
          rateLimitResetTimes: {}
        }]
      };
    }
    return null;
  }

  try {
    const content = await fs.readFile(configPath, "utf-8");
    const data = JSON.parse(content) as AccountsConfig;
    
    if (envToken) {
      if (!Array.isArray(data.accounts)) {
        data.accounts = [];
      }
      const hasEnvToken = data.accounts.some(a => a.refreshToken === envToken);
      if (!hasEnvToken) {
        data.accounts.push({
          refreshToken: envToken,
          email: "env-user@ci",
          lastUsed: 0,
          rateLimitResetTimes: {}
        });
      }
    }

    if (!Array.isArray(data.accounts)) {
      return null;
    }

    return data;
  } catch {
    if (envToken) {
      return {
        version: 1,
        activeIndex: 0,
        accounts: [{
          refreshToken: envToken,
          email: "env-user@ci",
          lastUsed: 0,
          rateLimitResetTimes: {}
        }]
      };
    }
    return null;
  }
}

export async function saveAccounts(config: AccountsConfig): Promise<void> {
  let configPath = await findConfigPath();
  if (!configPath) {
    const defaultPath = CONFIG_PATHS[0];
    if (defaultPath) {
      configPath = defaultPath;
    } else {
      throw new Error("No accounts config file found");
    }
  }

  await fs.mkdir(dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
}

function getRateLimitKey(model: string): string {
  return `${RATE_LIMIT_KEY_PREFIX}:${model}`;
}

function isRateLimited(account: Account, model: string): boolean {
  const key = getRateLimitKey(model);
  const resetTime = account.rateLimitResetTimes?.[key] ?? 0;
  return resetTime > Date.now();
}

function getRateLimitResetTime(account: Account, model: string): number {
  const key = getRateLimitKey(model);
  return account.rateLimitResetTimes?.[key] ?? 0;
}

export function selectAccount(
  config: AccountsConfig,
  model: string
): Account | null {
  const now = Date.now();
  const availableAccounts: Array<{ account: Account; index: number }> = [];

  for (let i = 0; i < config.accounts.length; i++) {
    const account = config.accounts[i];
    if (!account?.refreshToken) continue;

    if (!isRateLimited(account, model)) {
      availableAccounts.push({ account, index: i });
    }
  }

  if (availableAccounts.length === 0) {
    let earliestReset = Infinity;
    let bestAccount: Account | null = null;

    for (const account of config.accounts) {
      if (!account?.refreshToken) continue;
      const resetTime = getRateLimitResetTime(account, model);
      if (resetTime < earliestReset) {
        earliestReset = resetTime;
        bestAccount = account;
      }
    }

    return bestAccount;
  }

  availableAccounts.sort((a, b) => {
    const aLastUsed = a.account.lastUsed ?? 0;
    const bLastUsed = b.account.lastUsed ?? 0;
    return aLastUsed - bLastUsed;
  });

  return availableAccounts[0]?.account ?? null;
}

export async function markRateLimited(
  config: AccountsConfig,
  account: Account,
  model: string,
  resetTimeMs: number
): Promise<void> {
  const key = getRateLimitKey(model);
  const resetTime = Date.now() + resetTimeMs;

  const accountIndex = config.accounts.findIndex(
    (a) => a.refreshToken === account.refreshToken
  );

  if (accountIndex === -1) return;

  const targetAccount = config.accounts[accountIndex];
  if (!targetAccount) return;

  if (!targetAccount.rateLimitResetTimes) {
    targetAccount.rateLimitResetTimes = {};
  }

  targetAccount.rateLimitResetTimes[key] = resetTime;
  targetAccount.lastSwitchReason = "rate-limit";

  await saveAccounts(config);
}

export async function markAccountUsed(
  config: AccountsConfig,
  account: Account
): Promise<void> {
  const accountIndex = config.accounts.findIndex(
    (a) => a.refreshToken === account.refreshToken
  );

  if (accountIndex === -1) return;

  const targetAccount = config.accounts[accountIndex];
  if (!targetAccount) return;

  targetAccount.lastUsed = Date.now();

  await saveAccounts(config);
}

export function getNextAvailableResetTime(
  config: AccountsConfig,
  model: string
): number | null {
  let earliest = Infinity;

  for (const account of config.accounts) {
    if (!account?.refreshToken) continue;
    const resetTime = getRateLimitResetTime(account, model);
    if (resetTime > Date.now() && resetTime < earliest) {
      earliest = resetTime;
    }
  }

  return earliest === Infinity ? null : earliest;
}

export function formatDuration(ms: number): string {
  if (ms < 0) return "now";

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}
