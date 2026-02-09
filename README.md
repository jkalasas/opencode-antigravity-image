# Opencode Antigravity Image Plugin 

> **⚠️ UNOFFICIAL TOOL**: This is an independent, community-developed plugin. It is not affiliated with, endorsed by, or supported by Google. Use at your own risk.

OpenCode plugin for image generation using Gemini 3 Pro Image model.

## Features

- **Text-to-image generation** - Create images from text descriptions
- **Image editing** - Modify existing images with text instructions
- **Multiple images** - Generate up to 4 variations per request
- **Character consistency** - Session-based generation for consistent characters
- **Configurable output** - Custom paths, filenames, and aspect ratios
- **Multi-account support** - Rate limit tracking and automatic account rotation

## Prerequisites

This plugin requires `opencode-antigravity-auth` to be installed and configured with at least one Google account.

## Installation

<details open>
<summary><b>For Humans</b></summary>

### Option 1: Add to OpenCode config (Recommended)

Add to your `~/.config/opencode/opencode.json`:

```json
{
  "plugin": [
    "opencode-antigravity-image"
  ]
}
```

### Option 2: Local development

```bash
git clone <repo-url>
cd opencode-antigravity-image
bun install
```

Then add to `~/.config/opencode/opencode.json`:

```json
{
  "plugin": [
    "/path/to/opencode-antigravity-image"
  ]
}
```

</details>

<details>
<summary><b>For LLM Agents</b></summary>

### Step-by-Step Instructions

1. **Check Prerequisites**: Ensure `opencode-antigravity-auth` is installed in `~/.config/opencode/opencode.json`.

2. **Install Plugin**: Add `opencode-antigravity-image` to the `plugin` array in `~/.config/opencode/opencode.json`.

   ```json
   {
     "plugin": [
       "opencode-antigravity-auth",
       "opencode-antigravity-image"
     ]
   }
   ```

### Verification

Ask the user to generate an image to verify the installation:

```bash
\generate-image A cyberpunk cat
```

</details>

## Usage

### Basic Image Generation

- Via `generate-image` command
```
\generate-image A cyberpunk cat in neon-lit Tokyo streets, file name should be cyberpunk-cat save it at ~/Pictures
```


- Using tool format:

```
generate_image({ prompt: "A cyberpunk cat in neon-lit Tokyo streets" })
```

### With Aspect Ratio

```
generate_image({ 
  prompt: "A majestic mountain landscape", 
  aspect_ratio: "16:9" 
})
```

### With Custom Filename

```
generate_image({
  prompt: "A dragon flying over mountains",
  file_name: "my-dragon"
})
```

### Image Editing

```
generate_image({
  prompt: "Change the sky to a dramatic sunset",
  input_image: "./my-photo.jpg"
})
```

### Multiple Variations

```
generate_image({
  prompt: "A fantasy castle in the clouds",
  count: 4
})
```

### Character Consistency

```
// Create a character
generate_image({
  prompt: "Create a hero character: Luna, a silver-haired warrior",
  session_id: "luna-character"
})

// Generate new scenes with the same character
generate_image({
  prompt: "Show Luna fighting a dragon",
  session_id: "luna-character"
})
```

### Custom Output Path

```
generate_image({
  prompt: "Abstract art piece",
  output_path: "./my-images/"
})
```

### Restrict Which Google Accounts Are Used (Optional)

If you have multiple Google accounts configured in `antigravity-accounts.json`, you can restrict image generation to a subset.

Option A: environment variable (comma-separated)

```bash
export OPENCODE_ANTIGRAVITY_IMAGE_ALLOWED_EMAILS="you@example.com,other@example.com"
```

Option B: config file (checked in this order)

- `~/.config/opencode/antigravity-image.json`
- `~/.local/share/opencode/antigravity-image.json`

Example `antigravity-image.json`:

```json
{ "allowedEmails": ["you@example.com", "other@example.com"] }
```

Note: this matches on the `email` field in `antigravity-accounts.json`. If your accounts file has no emails, re-auth with `opencode auth login` so they get populated.

## Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `prompt` | string | (required) | Description of the image or editing instruction |
| `aspect_ratio` | string | "1:1" | Aspect ratio: 1:1, 2:3, 3:2, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9, 21:9 |
| `output_path` | string | `.opencode/generated-images/` | Custom directory for saving images |
| `file_name` | string | - | Custom filename (without extension) |
| `input_image` | string | - | Path to existing image for editing |
| `count` | number | 1 | Number of images to generate (1-4) |
| `session_id` | string | - | Session ID for character consistency |

## Output

Images are saved to `.opencode/generated-images/` in your project by default, with filenames like:

```
{prompt-slug}-{timestamp}.jpg
```

Or with custom filename:

```
{custom-name}.jpg
```

The tool returns markdown with:
- Embedded image references
- File paths
- Session info (if used)
- Model and account info

## Sessions

Sessions are stored in `.opencode/generated-image-sessions/` within your project directory. Each session maintains conversation history for character consistency.

## License

MIT

<details>
<summary><strong>Legal</strong></summary>

### Intended Use

- Personal / internal development only
- Respect internal quotas and data handling policies
- Not for production services or bypassing intended limits

### Warning

By using this plugin, you acknowledge:

- **Terms of Service risk** — This approach may violate ToS of AI model providers
- **Account risk** — Providers may suspend or ban accounts
- **No guarantees** — APIs may change without notice
- **Assumption of risk** — You assume all legal, financial, and technical risks

### Disclaimer

Not affiliated with Google. This is an independent open-source project.

"Antigravity", "Gemini", "Google Cloud", and "Google" are trademarks of Google LLC.

</details>
