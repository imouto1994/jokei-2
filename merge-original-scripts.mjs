/**
 * Merge Original Scripts
 *
 * Reads every text file in `original-script/`, detects inline speech
 * patterns, and writes a single `merged-original.txt`.
 *
 * Speech is inline in each line: `speaker「content」` or `speaker（content）`.
 * A known speaker set distinguishes speech from narration.
 *
 * Detected speech lines become two lines:
 *
 *   ＃{speaker}
 *   「{content}」  or  （{content}）
 *
 * Everything else becomes a single narration line.
 *
 * File sections are separated by `--------------------` and each section
 * starts with the filename followed by `********************`.
 *
 * Usage:
 *   node merge-original-scripts.mjs
 */

import { glob } from "glob";
import { mkdir, readFile, rm, writeFile } from "fs/promises";
import path from "path";

const INPUT_DIR = "original-script";
const OUTPUT_FILE = "merged-original.txt";
const JOINED_LINES_FILE = "joined-lines.txt";

const SECTION_SEPARATOR = "--------------------";
const HEADER_SEPARATOR = "********************";

const MAX_CHUNK_LINES = 900;
const CHUNKS_DIR = "original-merged-chunks";

// Known speaker names used to detect inline speech patterns.
const KNOWN_SPEAKERS = new Set([
  "達也",
  "すみれ",
  "美宙",
  "詩苑",
  "えみり",
  "千里",
  "祥子",
  "潮",
  "蟇田",
  "相馬",
  "？？？",
  "従業員Ａ",
  "従業員Ｂ",
  "従業員Ｃ",
  "メイド",
  "サラリーマン",
  "ＯＬ",
  "女の声",
  "役人",
  "アナウンス",
]);

// Matches speaker「content」 where speaker is at the start.
const SPEECH_PATTERN = /^(.+?)(「[\s\S]*」)$/;

/**
 * Try to parse an inline speech line into { speaker, content }.
 * Returns null if the line is narration.
 */
function parseSpeech(line) {
  const match = line.match(SPEECH_PATTERN);
  if (!match) return null;

  const speaker = match[1];
  const content = match[2];

  // Only treat as speech if the speaker is in the known set.
  if (!KNOWN_SPEAKERS.has(speaker)) return null;

  return { speaker, content };
}

async function main() {
  // Step 1: Discover all text files in the input directory.
  const files = (await glob(`${INPUT_DIR}/*.txt`)).sort();

  if (files.length === 0) {
    console.error(`No .txt files found in ${INPUT_DIR}/`);
    process.exit(1);
  }

  const sections = [];
  const allJoinedLines = [];

  for (const filePath of files) {
    // Step 2: Read each text file (already UTF-8).
    const fileName = path.basename(filePath, ".txt");
    const raw = await readFile(filePath, "utf-8");
    let srcLines = raw.split("\n");
    if (srcLines.at(-1) === "") srcLines.pop();

    // Step 3: In END files, join lines that don't end with sentence-ending
    // punctuation, or that have an unclosed 「 bracket. These are display
    // fragments that form a single sentence.
    if (fileName.includes("-END")) {
      const SENTENCE_ENDERS = new Set(["。", "！", "？", "…", "）", "」", "）", "》", "～"]);
      const joined = [];
      for (const line of srcLines) {
        if (joined.length > 0) {
          const prev = joined[joined.length - 1];
          const hasUnclosedQuote =
            prev.includes("「") && !prev.includes("」");
          if (!SENTENCE_ENDERS.has(prev.slice(-1)) || hasUnclosedQuote) {
            joined[joined.length - 1] += line;
            continue;
          }
        }
        joined.push(line);
      }
      // Track which lines were joined (differ from the original).
      if (joined.length !== srcLines.length) {
        for (const line of joined) {
          if (!srcLines.includes(line)) {
            allJoinedLines.push(`[${fileName}] ${line}`);
          }
        }
      }
      srcLines = joined;
    }

    // Step 4: Convert each line.
    // Inline speech (speaker「content」) is split into ＃{speaker} + content.
    // Everything else is kept as narration.
    const lines = [];
    for (const srcLine of srcLines) {
      const speech = parseSpeech(srcLine);
      if (speech) {
        lines.push(`＃${speech.speaker}`);
        lines.push(speech.content);
      } else {
        lines.push(srcLine);
      }
    }

    // Step 4: Build the section with a filename header.
    sections.push(`${fileName}\n${HEADER_SEPARATOR}\n${lines.join("\n")}`);
  }

  // Step 5: Prepend each section with a separator and write to disk.
  const output = sections.map((s) => `${SECTION_SEPARATOR}\n${s}`).join("\n");
  await writeFile(OUTPUT_FILE, output + "\n", "utf-8");

  console.log(`${files.length} files merged into ${OUTPUT_FILE}`);

  // Step 6: Write out the list of lines that were joined in END files.
  if (allJoinedLines.length > 0) {
    await writeFile(JOINED_LINES_FILE, allJoinedLines.join("\n") + "\n", "utf-8");
    console.log(`${allJoinedLines.length} joined lines written to ${JOINED_LINES_FILE}`);
  }

  // Step 7: Split sections into line-limited chunks.
  await rm(CHUNKS_DIR, { recursive: true, force: true });
  await mkdir(CHUNKS_DIR, { recursive: true });

  const chunks = [];
  let currentChunk = [];
  let currentLineCount = 0;

  for (const section of sections) {
    const sectionText = `${SECTION_SEPARATOR}\n${section}`;
    const sectionLineCount = sectionText.split("\n").length;

    // If adding this section exceeds the limit and we already have content,
    // flush the current chunk first.
    if (currentLineCount + sectionLineCount > MAX_CHUNK_LINES && currentChunk.length > 0) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentLineCount = 0;
    }

    currentChunk.push(sectionText);
    currentLineCount += sectionLineCount;
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  for (let i = 0; i < chunks.length; i++) {
    const chunkNum = String(i + 1).padStart(3, "0");
    const chunkPath = path.join(CHUNKS_DIR, `part-${chunkNum}.txt`);
    await writeFile(chunkPath, chunks[i].join("\n") + "\n", "utf-8");
  }

  console.log(`${chunks.length} chunks written to ${CHUNKS_DIR}/`);
}

main().catch(console.error);
