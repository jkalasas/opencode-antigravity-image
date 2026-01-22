import type { AspectRatio, SupportedModel } from "./constants";

export interface RateLimitResetTimes {
  [key: string]: number;
}

export interface Account {
  email?: string;
  refreshToken: string;
  projectId?: string;
  managedProjectId?: string;
  addedAt?: number;
  lastUsed?: number;
  rateLimitResetTimes?: RateLimitResetTimes;
  lastSwitchReason?: "rate-limit" | "initial" | "rotation";
  coolingDownUntil?: number;
  cooldownReason?: "auth-failure" | "network-error" | "project-error";
}

export interface AccountsConfig {
  version: number;
  accounts: Account[];
  activeIndex: number;
  activeIndexByFamily?: Record<string, number>;
}

export interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
  refresh_token?: string;
}

export interface InlineDataPart {
  inlineData: {
    mimeType: string;
    data: string;
  };
}

export interface TextPart {
  text: string;
}

export type Part = InlineDataPart | TextPart;

export interface Content {
  role: "user" | "model";
  parts: Part[];
}

export interface ImageConfig {
  aspectRatio?: AspectRatio;
  numberOfImages?: number;
}

export interface GenerationConfig {
  responseModalities: string[];
  imageConfig?: ImageConfig;
  candidateCount?: number;
}

export interface SafetySetting {
  category: string;
  threshold: string;
}

export interface SystemInstruction {
  parts: Array<{ text: string }>;
}

export interface GenerateContentRequest {
  contents: Content[];
  generationConfig: GenerationConfig;
  safetySettings?: SafetySetting[];
  systemInstruction?: SystemInstruction;
}

export interface CandidatePart {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string;
  };
}

export interface Candidate {
  content: {
    parts: CandidatePart[];
    role: string;
  };
  finishReason: string;
  safetyRatings?: Array<{
    category: string;
    probability: string;
  }>;
}

export interface GenerateContentResponse {
  candidates?: Candidate[];
  promptFeedback?: {
    blockReason?: string;
    safetyRatings?: Array<{
      category: string;
      probability: string;
    }>;
  };
  error?: {
    code: number;
    message: string;
    status: string;
  };
}

export interface Session {
  id: string;
  createdAt: number;
  updatedAt: number;
  history: Content[];
}

export interface GenerateImageInput {
  prompt: string;
  aspect_ratio?: AspectRatio;
  output_path?: string;
  model?: SupportedModel;
  input_image?: string;
  count?: number;
  session_id?: string;
  file_name?: string;
}

export interface GeneratedImage {
  path: string;
  mimeType: string;
  index: number;
}

export interface GenerateImageResult {
  success: boolean;
  images?: GeneratedImage[];
  error?: string;
  sessionId?: string;
}
