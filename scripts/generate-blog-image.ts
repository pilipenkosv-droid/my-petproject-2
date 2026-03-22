/**
 * Generate blog illustration via Gemini API
 *
 * Usage: npx tsx scripts/generate-blog-image.ts --prompt "..." --output "public/blog/slug.png"
 *
 * Requires: npm install @google/genai
 * Env: GEMINI_API_KEY
 */

import { GoogleGenAI } from "@google/genai";
import * as fs from "node:fs";
import * as path from "node:path";

const STYLE_SUFFIX =
  ", flat illustration style, soft blue and purple tones, minimal clean composition, no text on the image, wide landscape format 16:9 aspect ratio";

async function main() {
  const args = process.argv.slice(2);
  const promptIdx = args.indexOf("--prompt");
  const outputIdx = args.indexOf("--output");

  if (promptIdx === -1 || outputIdx === -1) {
    console.error(
      'Usage: npx tsx scripts/generate-blog-image.ts --prompt "..." --output "path.png"'
    );
    process.exit(1);
  }

  const prompt = args[promptIdx + 1] + STYLE_SUFFIX;
  const outputPath = args[outputIdx + 1];

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("GEMINI_API_KEY not set");
    process.exit(1);
  }

  console.log("Generating image with prompt:", prompt.slice(0, 100) + "...");

  const ai = new GoogleGenAI({ apiKey });

  const response = await ai.models.generateContent({
    model: "gemini-3.1-flash-image-preview",
    contents: prompt,
    config: {
      responseModalities: ["IMAGE", "TEXT"],
    },
  });

  const parts = response.candidates?.[0]?.content?.parts;

  if (!parts) {
    console.error("No response parts from Gemini");
    process.exit(1);
  }

  for (const part of parts) {
    if (part.inlineData) {
      const buffer = Buffer.from(part.inlineData.data!, "base64");
      const absPath = path.resolve(outputPath);
      fs.mkdirSync(path.dirname(absPath), { recursive: true });
      fs.writeFileSync(absPath, buffer);
      console.log(`Image saved to ${absPath} (${buffer.length} bytes)`);
      return;
    }
  }

  console.error("No image data in Gemini response");
  process.exit(1);
}

main().catch((err) => {
  console.error("Image generation failed:", err.message);
  process.exit(1);
});
