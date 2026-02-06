import * as path from "path";
import * as os from "os";
import {
  ANTIGRAVITY_CLIENT_ID as AUTH_CLIENT_ID,
  ANTIGRAVITY_CLIENT_SECRET as AUTH_CLIENT_SECRET,
  ANTIGRAVITY_ENDPOINT_DAILY,
} from "opencode-antigravity-auth/dist/src/constants";

const isWindows = os.platform() === "win32";

const configBase = isWindows
  ? path.join(os.homedir(), "AppData", "Roaming", "opencode")
  : path.join(os.homedir(), ".config", "opencode");

const xdgData = process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share");
const dataBase = isWindows ? configBase : path.join(xdgData, "opencode");

export const CONFIG_PATHS = Array.from(new Set([
  path.join(configBase, "antigravity-accounts.json"),
  path.join(dataBase, "antigravity-accounts.json"),
]));

export const ANTIGRAVITY_CLIENT_ID = AUTH_CLIENT_ID;
export const ANTIGRAVITY_CLIENT_SECRET = AUTH_CLIENT_SECRET;

export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const ANTIGRAVITY_ENDPOINT = ANTIGRAVITY_ENDPOINT_DAILY;

export const SUPPORTED_MODELS = [
  "gemini-3-pro-image",
] as const;
export type SupportedModel = typeof SUPPORTED_MODELS[number];
export const DEFAULT_MODEL: SupportedModel = "gemini-3-pro-image";

// Valid aspect ratios for image generation
export const VALID_ASPECT_RATIOS = [
  "1:1",
  "2:3",
  "3:2",
  "3:4",
  "4:3",
  "4:5",
  "5:4",
  "9:16",
  "16:9",
  "21:9",
] as const;
export type AspectRatio = typeof VALID_ASPECT_RATIOS[number];
export const DEFAULT_ASPECT_RATIO: AspectRatio = "1:1";

// Valid image sizes for image generation
export const VALID_IMAGE_SIZES = ["1K", "2K", "4K"] as const;
export type ImageSize = typeof VALID_IMAGE_SIZES[number];
export const DEFAULT_IMAGE_SIZE: ImageSize = "1K";

// Default output directory (relative to project root)
export const DEFAULT_OUTPUT_DIR = ".opencode/generated-images";

// Sessions directory (relative to project root)
export const SESSIONS_SUBDIR = ".opencode/generated-image-sessions";

// Rate limit key for tracking in accounts file
export const RATE_LIMIT_KEY_PREFIX = "gemini-antigravity";

// Command file for OpenCode discovery
const commandBase = path.join(os.homedir(), ".config", "opencode");
export const COMMAND_DIR = path.join(commandBase, "command");
export const COMMAND_FILE = path.join(COMMAND_DIR, "generate-image.md");
export const COMMAND_CONTENT = `---
description: Generate images using Gemini 3 Pro Image model
---

Use the \`generate_image\` tool to create images from text prompts.

## Basic Usage
\`\`\`
generate_image({ prompt: "A futuristic city at sunset" })
\`\`\`

## Options
- \`prompt\` (required): Description of the image to generate
- \`aspect_ratio\`: "1:1" (default), "16:9", "9:16", "3:4", "4:3", etc.
- \`file_name\`: Custom filename (without extension)
- \`input_image\`: Path to an existing image for editing
- \`count\`: Number of images to generate (1-4, default: 1)
- \`output_path\`: Custom directory for saving images
- \`session_id\`: For character consistency across generations

## Examples

### Generate a single image
\`\`\`
generate_image({ 
  prompt: "A cyberpunk cat in neon-lit Tokyo streets",
  aspect_ratio: "16:9"
})
\`\`\`

### With custom filename
\`\`\`
generate_image({
  prompt: "A majestic dragon",
  file_name: "my-dragon"
})
\`\`\`

### Edit an existing image
\`\`\`
generate_image({
  prompt: "Change the sky to a beautiful sunset",
  input_image: "./my-photo.jpg"
})
\`\`\`

### Generate multiple variations
\`\`\`
generate_image({
  prompt: "A majestic dragon flying over mountains",
  count: 4
})
\`\`\`

### Maintain character consistency
\`\`\`
generate_image({
  prompt: "Create a hero character named Luna",
  session_id: "luna-character"
})
// Then continue with the same session
generate_image({
  prompt: "Show Luna fighting a dragon",
  session_id: "luna-character"
})
\`\`\`

Images are saved to \`.opencode/generated-images/\` in your project by default.

IMPORTANT: Display the tool output EXACTLY as it is returned. Do not summarize or reformat.
`;
