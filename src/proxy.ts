import { ProxyAgent } from 'undici';
import type Dispatcher from 'undici/types/dispatcher';
import type { RequestInit as UndiciRequestInit } from 'undici/types/fetch';

const agentCache = new Map<string, ProxyAgent>();
const SUPPORTED_PROTOCOLS = new Set(['http:', 'https:']);

export function validateProxyUrl(proxyUrl: string): void {
  const normalizedUrl = proxyUrl.trim();
  if (!normalizedUrl) return;

  let parsed: URL;
  try {
    parsed = new URL(normalizedUrl);
  } catch {
    throw new Error(`Invalid proxy URL format: ${proxyUrl}`);
  }

  if (!SUPPORTED_PROTOCOLS.has(parsed.protocol)) {
    throw new Error(`Unsupported proxy protocol: ${parsed.protocol} (only http: and https: supported)`);
  }
}

export function getProxyAgent(proxyUrl?: string): ProxyAgent | undefined {
  if (!proxyUrl?.trim()) return undefined;
  
  const normalizedUrl = proxyUrl.trim();

  validateProxyUrl(normalizedUrl);

  let agent = agentCache.get(normalizedUrl);
  
  if (!agent) {
    agent = new ProxyAgent({
      uri: normalizedUrl,
      connect: { timeout: 30000 },
    });
    agentCache.set(normalizedUrl, agent);
  }
  
  return agent;
}

export async function fetchWithProxy(
  input: string | URL,
  init?: RequestInit,
  proxyUrl?: string,
): Promise<Response> {
  const agent = getProxyAgent(proxyUrl);
  
  if (!agent) {
    return fetch(input, init);
  }
  
  const { fetch: undiciFetch } = await import('undici');
  
  const url = typeof input === 'string' ? input : input.href;
  
  const response = await undiciFetch(url, {
    ...init as UndiciRequestInit,
    dispatcher: agent,
  });
  
  return response as unknown as Response;
}
