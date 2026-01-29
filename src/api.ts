import * as fs from "fs/promises";
import { existsSync } from "fs";
import * as path from "path";
import {
  ANTIGRAVITY_CLIENT_ID,
  ANTIGRAVITY_CLIENT_SECRET,
  GOOGLE_TOKEN_URL,
  ANTIGRAVITY_ENDPOINT,
  DEFAULT_ASPECT_RATIO,
  DEFAULT_IMAGE_SIZE,
  QUOTA_API_URL,
  QUOTA_USER_AGENT,
  DEFAULT_MODEL,
  type AspectRatio,
  type ImageSize,
  type SupportedModel,
} from "./constants";
import type {
  TokenResponse,
  Content,
  Part,
  InlineDataPart,
  TextPart,
  GenerateContentRequest,
  GenerateContentResponse,
  CandidatePart,
  CachedImageQuota,
  QuotaApiResponse,
} from "./types";

export async function refreshAccessToken(refreshToken: string): Promise<string> {
  const params = new URLSearchParams({
    client_id: ANTIGRAVITY_CLIENT_ID,
    client_secret: ANTIGRAVITY_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token refresh failed (${response.status}): ${text}`);
  }

  const data = (await response.json()) as TokenResponse;
  return data.access_token;
}

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".bmp": "image/bmp",
  };
  return mimeTypes[ext] ?? "image/png";
}

export async function imageToBase64(imagePath: string): Promise<InlineDataPart> {
  const absolutePath = path.isAbsolute(imagePath)
    ? imagePath
    : path.resolve(process.cwd(), imagePath);

  if (!existsSync(absolutePath)) {
    throw new Error(`Image file not found: ${absolutePath}`);
  }

  const buffer = await fs.readFile(absolutePath);
  const base64 = buffer.toString("base64");
  const mimeType = getMimeType(absolutePath);

  return {
    inlineData: {
      mimeType,
      data: base64,
    },
  };
}

export function buildContents(
  prompt: string,
  inputImage?: InlineDataPart,
  sessionHistory?: Content[]
): Content[] {
  const contents: Content[] = [];

  if (sessionHistory && sessionHistory.length > 0) {
    contents.push(...sessionHistory);
  }

  const userParts: Part[] = [];

  if (inputImage) {
    userParts.push(inputImage);
  }

  userParts.push({ text: prompt } as TextPart);

  contents.push({
    role: "user",
    parts: userParts,
  });

  return contents;
}

export interface GenerateImageOptions {
  aspectRatio?: AspectRatio;
  imageSize?: ImageSize;
  count?: number;
}

export async function generateImages(
  accessToken: string,
  model: SupportedModel,
  contents: Content[],
  options: GenerateImageOptions = {}
): Promise<GenerateContentResponse> {
  const { aspectRatio = DEFAULT_ASPECT_RATIO, imageSize = DEFAULT_IMAGE_SIZE, count = 1 } = options;

  const url = `${ANTIGRAVITY_ENDPOINT}/v1internal:generateContent`;

  const innerRequest: GenerateContentRequest = {
    contents,
    generationConfig: {
      responseModalities: ["IMAGE"],
      imageConfig: {
        aspectRatio,
        imageSize,
      },
      candidateCount: count,
    },
    safetySettings: [
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_ONLY_HIGH" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" },
      { category: "HARM_CATEGORY_CIVIC_INTEGRITY", threshold: "BLOCK_ONLY_HIGH" },
    ],
    systemInstruction: {
      parts: [{ text: "You are an AI image generator. Generate images based on user descriptions. Focus on creating high-quality, visually appealing images that match the user's request." }],
    },
  };

  // Antigravity wrapped body format
  const wrappedBody = {
    project: "opencode-antigravity-image",
    model: model,
    request: innerRequest,
    requestType: "agent",
    userAgent: "antigravity",
    requestId: `agent-${crypto.randomUUID()}`,
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      "User-Agent": "antigravity/1.11.5 linux/amd64",
      "X-Goog-Api-Client": "google-cloud-sdk vscode_cloudshelleditor/0.1",
      "Client-Metadata": '{"ideType":"IDE_UNSPECIFIED","platform":"PLATFORM_UNSPECIFIED","pluginType":"GEMINI"}',
    },
    body: JSON.stringify(wrappedBody),
  });

  if (response.status === 429) {
    const retryAfter = response.headers.get("Retry-After");
    const retryMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 60 * 60 * 1000;
    const error = new Error(`Rate limit exceeded. Retry after ${Math.ceil(retryMs / 1000 / 60)} minutes.`);
    (error as RateLimitError).isRateLimit = true;
    (error as RateLimitError).retryAfterMs = retryMs;
    throw error;
  }

  if (response.status === 503) {
    const text = await response.text();
    let retryMs = 60 * 1000;
    let isCapacityExhausted = false;
    
    try {
      const errorData = JSON.parse(text);
      const errorInfo = errorData?.error?.details?.find(
        (d: { "@type"?: string; reason?: string }) => 
          d["@type"]?.includes("ErrorInfo") && d.reason === "MODEL_CAPACITY_EXHAUSTED"
      );
      isCapacityExhausted = !!errorInfo;
      
      if (isCapacityExhausted) {
        const retryInfo = errorData?.error?.details?.find(
          (d: { "@type"?: string }) => d["@type"]?.includes("RetryInfo")
        );
        if (retryInfo?.retryDelay) {
          const match = retryInfo.retryDelay.match(/^(\d+(?:\.\d+)?)s$/);
          if (match) {
            retryMs = Math.ceil(parseFloat(match[1]) * 1000);
          }
        }
      }
    } catch {
      // Parse failed, treat as generic 503
    }
    
    if (isCapacityExhausted) {
      const error = new Error(`Model capacity exhausted. Retry after ${Math.ceil(retryMs / 1000)} seconds.`);
      (error as CapacityError).isCapacityError = true;
      (error as CapacityError).retryAfterMs = retryMs;
      throw error;
    }
    
    throw new Error(`API request failed (503): ${text}`);
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API request failed (${response.status}): ${text}`);
  }

  const data = (await response.json()) as { response?: GenerateContentResponse } & GenerateContentResponse;
  
  // Antigravity wraps the response in a "response" field
  if (data.response) {
    return data.response;
  }
  return data;
}

export interface RateLimitError extends Error {
  isRateLimit: boolean;
  retryAfterMs: number;
}

export function isRateLimitError(error: unknown): error is RateLimitError {
  return (
    error instanceof Error &&
    "isRateLimit" in error &&
    (error as RateLimitError).isRateLimit === true
  );
}

export interface CapacityError extends Error {
  isCapacityError: boolean;
  retryAfterMs: number;
}

export function isCapacityError(error: unknown): error is CapacityError {
  return (
    error instanceof Error &&
    "isCapacityError" in error &&
    (error as CapacityError).isCapacityError === true
  );
}

export interface ExtractedImage {
  mimeType: string;
  data: string;
}

export function extractImages(response: GenerateContentResponse): ExtractedImage[] {
  const images: ExtractedImage[] = [];

  if (response.error) {
    throw new Error(`API error: ${response.error.message}`);
  }

  if (response.promptFeedback?.blockReason) {
    throw new Error(
      `Content blocked by safety filter: ${response.promptFeedback.blockReason}`
    );
  }

  if (!response.candidates || response.candidates.length === 0) {
    throw new Error("No images generated - empty response");
  }

  for (const candidate of response.candidates) {
    if (candidate.finishReason === "SAFETY") {
      console.warn("Image blocked by safety filter");
      continue;
    }

    for (const part of candidate.content.parts) {
      if (part.inlineData?.data) {
        images.push({
          mimeType: part.inlineData.mimeType,
          data: part.inlineData.data,
        });
      }
    }
  }

  return images;
}

export function buildModelResponseContent(response: GenerateContentResponse): Content {
  const parts: Part[] = [];

  if (response.candidates && response.candidates.length > 0) {
    const firstCandidate = response.candidates[0];
    if (firstCandidate) {
      for (const part of firstCandidate.content.parts) {
        if (part.text) {
          parts.push({ text: part.text } as TextPart);
        } else if (part.inlineData) {
          parts.push({
            inlineData: {
              mimeType: part.inlineData.mimeType,
              data: part.inlineData.data,
            },
          } as InlineDataPart);
        }
      }
    }
  }

  return {
    role: "model",
    parts,
  };
}

export async function fetchImageModelQuota(
  accessToken: string
): Promise<CachedImageQuota | null> {
  try {
    const response = await fetch(QUOTA_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "User-Agent": QUOTA_USER_AGENT,
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as QuotaApiResponse;
    const imageModel = data.models?.[DEFAULT_MODEL];

    if (!imageModel?.quotaInfo) {
      return null;
    }

    if (imageModel.quotaInfo.remainingFraction === undefined || imageModel.quotaInfo.remainingFraction === null) {
      return null;
    }

    return {
      remainingFraction: imageModel.quotaInfo.remainingFraction,
      resetTime: imageModel.quotaInfo.resetTime,
      updatedAt: Date.now(),
    };
  } catch {
    return null;
  }
}
