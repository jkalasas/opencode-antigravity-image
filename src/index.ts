import { type Plugin, tool } from "@opencode-ai/plugin";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import {
  COMMAND_DIR,
  COMMAND_FILE,
  COMMAND_CONTENT,
  VALID_ASPECT_RATIOS,
  DEFAULT_MODEL,
  DEFAULT_ASPECT_RATIO,
  CONFIG_PATHS,
  IMAGE_CONFIG_PATHS,
} from "./constants";
import type { AspectRatio, SupportedModel } from "./constants";
import type { GenerateImageInput, Content, InlineDataPart, TextPart } from "./types";
import {
  loadAccounts,
  getAllowedImageAccountEmails,
  filterAccountsByEmailAllowlist,
  selectAccount,
  markRateLimited,
  markAccountUsed,
  getNextAvailableResetTime,
  formatDuration,
} from "./accounts";
import {
  refreshAccessToken,
  imageToBase64,
  buildContents,
  generateImages,
  extractImages,
  isRateLimitError,
  buildModelResponseContent,
} from "./api";
import {
  loadSession,
  saveSession,
  createSession,
  addMessageToSession,
  getSessionHistory,
} from "./sessions";
import { getOutputDir, saveImages, formatImageOutput } from "./image-saver";

const z = tool.schema;

try {
  if (!existsSync(COMMAND_DIR)) {
    mkdirSync(COMMAND_DIR, { recursive: true });
  }
  if (!existsSync(COMMAND_FILE)) {
    writeFileSync(COMMAND_FILE, COMMAND_CONTENT, "utf-8");
  } else {
    const currentContent = readFileSync(COMMAND_FILE, "utf-8");
    if (!currentContent.includes("generate_image")) {
      writeFileSync(COMMAND_FILE, COMMAND_CONTENT, "utf-8");
    }
  }
} catch (error) {
  console.error("Failed to create command file:", error);
}

export const plugin: Plugin = async (ctx) => {
  const worktree = ctx.worktree;

  return {
    tool: {
      generate_image: tool({
        description: `Generate images using Gemini 3 Pro Image model.

Features:
- Text-to-image generation
- Image editing (provide input_image + prompt)
- Multiple images per request (count 1-4)
- Session-based character consistency (session_id)

Uses credentials from opencode-antigravity-auth.`,
        args: {
          prompt: z
            .string()
            .describe("Description of the image to generate or editing instruction"),
          aspect_ratio: z
            .enum(VALID_ASPECT_RATIOS as unknown as [string, ...string[]])
            .optional()
            .describe(`Aspect ratio: ${VALID_ASPECT_RATIOS.join(", ")}. Default: 1:1`),
          output_path: z
            .string()
            .optional()
            .describe("Custom directory for saving images. Default: .opencode/generated-images/"),
          file_name: z
            .string()
            .optional()
            .describe("Custom filename (without extension). Default: auto-generated from prompt"),
          input_image: z
            .string()
            .optional()
            .describe("Path to an existing image for editing"),
          count: z
            .number()
            .min(1)
            .max(4)
            .optional()
            .describe("Number of images to generate (1-4). Default: 1"),
          session_id: z
            .string()
            .optional()
            .describe("Session ID for character consistency across generations"),
        },
        async execute(args, _context) {
          const {
            prompt,
            aspect_ratio: aspectRatio = DEFAULT_ASPECT_RATIO,
            output_path: outputPath,
            input_image: inputImage,
            count = 1,
            session_id: sessionId,
            file_name: fileName,
          } = args as GenerateImageInput;

          const model = DEFAULT_MODEL;
          const projectRoot = worktree ?? process.cwd();

          try {
            const config = await loadAccounts();
            if (!config || config.accounts.length === 0) {
              return `❌ **No Antigravity accounts configured**

Please set up opencode-antigravity-auth first:
1. Install the plugin: \`opencode-antigravity-auth\`
2. Run the authentication flow

Configuration file locations checked:
${CONFIG_PATHS.map((p) => `- ${p}`).join("\n")}`;
            }

            const allowlist = await getAllowedImageAccountEmails();
            const selectionConfig = allowlist
              ? filterAccountsByEmailAllowlist(config, allowlist)
              : config;

            if (allowlist && selectionConfig.accounts.length === 0) {
              return `❌ **No accounts match the image allowlist**

Set \`OPENCODE_ANTIGRAVITY_IMAGE_ALLOWED_EMAILS\` (comma-separated), or create an allowlist file at one of:
${IMAGE_CONFIG_PATHS.map((p) => `- ${p}`).join("\n")}

Example config file:
\`\`\`json
{ "allowedEmails": ["you@example.com", "other@example.com"] }
\`\`\``;
            }

            const account = selectAccount(selectionConfig, model);
            if (!account) {
              const resetTime = getNextAvailableResetTime(selectionConfig, model);
              if (resetTime) {
                const wait = formatDuration(resetTime - Date.now());
                return `❌ **All accounts are rate-limited**

Next available in: ${wait}

Try again later or add more accounts to opencode-antigravity-auth.`;
              }
              return "❌ **No valid accounts found**\n\nPlease check your antigravity-accounts.json configuration.";
            }

            let accessToken: string;
            try {
              accessToken = await refreshAccessToken(account.refreshToken);
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              return `❌ **Token refresh failed**

${message}

This may indicate the account needs to be re-authenticated.`;
            }

            let inputImagePart: InlineDataPart | undefined;
            if (inputImage) {
              try {
                inputImagePart = await imageToBase64(inputImage);
              } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return `❌ **Failed to load input image**

${message}`;
              }
            }

            let session = sessionId ? await loadSession(sessionId, projectRoot) : null;
            if (sessionId && !session) {
              session = createSession(sessionId);
            }

            const sessionHistory = session ? getSessionHistory(session) : undefined;
            const contents = buildContents(prompt, inputImagePart, sessionHistory);

            let response;
            try {
              response = await generateImages(accessToken, model as SupportedModel, contents, {
                aspectRatio: aspectRatio as AspectRatio,
                count,
              });
            } catch (error) {
              if (isRateLimitError(error)) {
                await markRateLimited(config, account, model, error.retryAfterMs);

                const nextAccount = selectAccount(selectionConfig, model);
                if (nextAccount && nextAccount.refreshToken !== account.refreshToken) {
                  try {
                    const newToken = await refreshAccessToken(nextAccount.refreshToken);
                    response = await generateImages(newToken, model as SupportedModel, contents, {
                      aspectRatio: aspectRatio as AspectRatio,
                      count,
                    });
                    await markAccountUsed(config, nextAccount);
                  } catch (retryError) {
                    const message = retryError instanceof Error ? retryError.message : String(retryError);
                    return `❌ **Rate limit hit, retry failed**

${message}

All available accounts are rate-limited. Try again later.`;
                  }
                } else {
                  const wait = formatDuration(error.retryAfterMs);
                  return `❌ **Rate limit exceeded**

Retry after: ${wait}

All accounts are currently rate-limited.`;
                }
              } else {
                const message = error instanceof Error ? error.message : String(error);
                return `❌ **Image generation failed**

${message}`;
              }
            }

            if (!response) {
              return "❌ **No response received from API**";
            }

            await markAccountUsed(config, account);

            let images;
            try {
              images = extractImages(response);
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              return `❌ **Failed to extract images**

${message}`;
            }

            if (images.length === 0) {
              return "❌ **No images were generated**\n\nThe model may have blocked the content. Try a different prompt.";
            }

            if (session) {
              addMessageToSession(session, "user", [
                ...(inputImagePart ? [inputImagePart] : []),
                { text: prompt } as TextPart,
              ]);

              const modelContent = buildModelResponseContent(response);
              addMessageToSession(session, "model", modelContent.parts);

              await saveSession(session, projectRoot);
            }

            const outputDir = getOutputDir(outputPath, projectRoot);
            const savedImages = saveImages(images, prompt, outputDir, fileName);

            let output = formatImageOutput(savedImages);

            if (sessionId) {
              output += `\n\n**Session:** \`${sessionId}\` (use same ID for consistent characters)`;
            }

            output += `\n\n**Model:** ${model} | **Aspect Ratio:** ${aspectRatio}`;

            if (account.email) {
              output += ` | **Account:** ${account.email.split("@")[0]}...`;
            }

            return output;
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return `❌ **Unexpected error**

${message}

Please report this issue if it persists.`;
          }
        },
      }),
    },
  };
};

export default plugin;
