/**
 * Extract Original Scripts from Game Scripts
 *
 * Parses each file in `game-script/`, extracts text from `#1-TEXT` entries,
 * and writes one UTF-8 text file per game script into `original-script/`.
 *
 * Game script format (Shift-JIS encoded):
 *
 *   #1-TEXT
 *   [
 *       "Japanese text line here"
 *   ]
 *
 * When a `#1-TEXT` entry is followed by anything other than `#1-SYS`
 * (e.g. `#1-RETURN`, `#1-MENU_SET`, `#1-A_FLAG_SET`), the next `#1-TEXT`
 * is a continuation and gets joined into the same line.
 *
 * Files with no `#1-TEXT` entries are skipped.
 *
 * Usage:
 *   node extract-original-scripts.mjs
 */

import { glob } from "glob";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

const INPUT_DIR = "game-script";
const OUTPUT_DIR = "original-script";

async function main() {
  // Step 1: Discover all game script files.
  const files = (await glob(`${INPUT_DIR}/*.txt`)).sort();

  if (files.length === 0) {
    console.error(`No .txt files found in ${INPUT_DIR}/`);
    process.exit(1);
  }

  // Step 2: Ensure the output directory exists.
  await mkdir(OUTPUT_DIR, { recursive: true });

  const sjisDecoder = new TextDecoder("shift_jis");
  let exported = 0;
  let skipped = 0;

  for (const filePath of files) {
    const fileName = path.basename(filePath);

    // Step 3: Read the file as raw bytes and decode from Shift-JIS.
    const raw = await readFile(filePath);
    const text = sjisDecoder.decode(raw);
    const lines = text.split("\n");

    // Step 4: Collect TEXT entries with their positions and content.
    const textEntries = [];
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim() !== "#1-TEXT") continue;

      const strLine = lines[i + 2] ? lines[i + 2].trim() : "";
      const match = strLine.match(/^"(.*)"$/);
      if (!match) continue;

      // Find the closing ] and check what command follows.
      let j = i + 3;
      while (j < lines.length && !lines[j].trim().startsWith("]")) j++;
      j++;
      while (j < lines.length && lines[j].trim() === "") j++;
      const nextCmd = j < lines.length ? lines[j].trim() : "";

      textEntries.push({
        content: match[1],
        isContinuation: nextCmd !== "#1-SYS",
      });
    }

    // Step 5: Join continuation entries (those followed by #1-RETURN)
    // with the next entry to form complete lines.
    const extracted = [];
    let pending = "";
    for (const entry of textEntries) {
      pending += entry.content;
      if (!entry.isContinuation) {
        extracted.push(pending);
        pending = "";
      }
    }
    if (pending) extracted.push(pending);

    // Step 6: Skip files that had no TEXT entries.
    if (extracted.length === 0) {
      skipped++;
      continue;
    }

    // Step 7: Write extracted lines as UTF-8.
    const outputPath = path.join(OUTPUT_DIR, fileName);
    await writeFile(outputPath, extracted.join("\n") + "\n", "utf-8");
    exported++;

    console.log(`${fileName} — ${extracted.length} lines`);
  }

  console.log(
    `\nDone. ${exported} files exported, ${skipped} skipped (no text).`,
  );
}

main().catch(console.error);
