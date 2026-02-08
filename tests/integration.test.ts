import { describe, test, expect, beforeAll } from "bun:test";
import { plugin } from "../src/index";
import * as fs from "fs/promises";
import * as path from "path";

const TEST_TOKEN = process.env.ANTIGRAVITY_REFRESH_TOKEN;
const TEST_OUTPUT_DIR = path.join(process.cwd(), ".test-output");

describe("Image Generation Integration", () => {
  beforeAll(async () => {
    try {
      await fs.rm(TEST_OUTPUT_DIR, { recursive: true, force: true });
      await fs.mkdir(TEST_OUTPUT_DIR, { recursive: true });
    } catch {}
  });

  test("should generate an image with default settings", async () => {
    if (!TEST_TOKEN) {
      console.warn("Skipping integration test: ANTIGRAVITY_REFRESH_TOKEN not set");
      return; 
    }

    console.log("Starting integration test with provided token...");

    const ctx: any = { worktree: process.cwd() };
    const p = await plugin(ctx);
    
    if (!p || !p.tool || !p.tool.generate_image) {
        throw new Error("Plugin failed to initialize tool");
    }

    const generateImage = p.tool.generate_image;
    const context: any = {};

    const result = await generateImage.execute({
      prompt: "A simple blue square, flat design, white background",
      count: 1,
      aspect_ratio: "1:1",
      output_path: TEST_OUTPUT_DIR
    }, context);

    expect(result).not.toContain("❌");
    expect(result).not.toContain("Error");
    expect(result).toContain("Model:");
    expect(result).toContain("**Size:** 1K");
    
    const files = await fs.readdir(TEST_OUTPUT_DIR);
    const imageFiles = files.filter(f => f.endsWith(".jpg") || f.endsWith(".png"));
    expect(imageFiles.length).toBeGreaterThan(0);
    
    console.log(`Generated ${imageFiles.length} images successfully.`);
  }, 120000);

  test("should generate an image with custom image_size", async () => {
    if (!TEST_TOKEN) {
      console.warn("Skipping integration test: ANTIGRAVITY_REFRESH_TOKEN not set");
      return; 
    }

    console.log("Starting image_size test...");

    const ctx: any = { worktree: process.cwd() };
    const p = await plugin(ctx);
    
    if (!p || !p.tool || !p.tool.generate_image) {
        throw new Error("Plugin failed to initialize tool");
    }

    const generateImage = p.tool.generate_image;
    const context: any = {};

    const result = await generateImage.execute({
      prompt: "A red circle on white background",
      count: 1,
      aspect_ratio: "1:1",
      image_size: "2K",
      output_path: TEST_OUTPUT_DIR,
      file_name: "test-2k-image"
    }, context);

    expect(result).not.toContain("❌");
    expect(result).not.toContain("Error");
    expect(result).toContain("**Size:** 2K");
    
    const files = await fs.readdir(TEST_OUTPUT_DIR);
    const testFile = files.find(f => f.includes("test-2k-image"));
    expect(testFile).toBeDefined();
    
    console.log("2K image generated successfully.");
  }, 120000);
});
