import * as fs from "fs/promises";
import { existsSync } from "fs";
import { dirname } from "path";
import { CONFIG_PATHS, RATE_LIMIT_KEY_PREFIX, SOFT_QUOTA_THRESHOLD, QUOTA_CACHE_TTL_MS } from "./constants";
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

function isSoftQuotaExceeded(account: Account): boolean {
  const quota = account.cachedImageQuota;
  if (!quota) return false;

  const cacheAge = Date.now() - quota.updatedAt;
  if (cacheAge > QUOTA_CACHE_TTL_MS) return false;

  return quota.remainingFraction <= SOFT_QUOTA_THRESHOLD;
}

export function selectAccount(
  config: AccountsConfig,
  model: string,
  excludeTokens: string[] = []
): Account | null {
  const availableAccounts: Array<{ account: Account; index: number }> = [];
  const softQuotaExceededAccounts: Array<{ account: Account; index: number }> = [];

  for (let i = 0; i < config.accounts.length; i++) {
    const account = config.accounts[i];
    if (!account?.refreshToken) continue;
    if (excludeTokens.includes(account.refreshToken)) continue;

    if (isRateLimited(account, model)) continue;

    if (isSoftQuotaExceeded(account)) {
      softQuotaExceededAccounts.push({ account, index: i });
    } else {
      availableAccounts.push({ account, index: i });
    }
  }

  if (availableAccounts.length === 0 && softQuotaExceededAccounts.length > 0) {
    softQuotaExceededAccounts.sort((a, b) => {
      const aQuota = a.account.cachedImageQuota?.remainingFraction ?? 0;
      const bQuota = b.account.cachedImageQuota?.remainingFraction ?? 0;
      return bQuota - aQuota;
    });
    const best = softQuotaExceededAccounts[0];
    if (best) {
      best.account.lastSwitchReason = "soft-quota";
      return best.account;
    }
  }

  if (availableAccounts.length === 0) {
    let earliestReset = Infinity;
    let bestAccount: Account | null = null;

    for (const account of config.accounts) {
      if (!account?.refreshToken) continue;
      if (excludeTokens.includes(account.refreshToken)) continue;
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

export async function updateAccountQuota(
  config: AccountsConfig,
  account: Account,
  remainingFraction: number,
  resetTime?: string
): Promise<void> {
  const accountIndex = config.accounts.findIndex(
    (a) => a.refreshToken === account.refreshToken
  );

  if (accountIndex === -1) return;

  const targetAccount = config.accounts[accountIndex];
  if (!targetAccount) return;

  const quotaUpdate = {
    remainingFraction,
    resetTime,
    updatedAt: Date.now(),
  };

  targetAccount.cachedImageQuota = quotaUpdate;
  account.cachedImageQuota = quotaUpdate;

  await saveAccounts(config);
}
