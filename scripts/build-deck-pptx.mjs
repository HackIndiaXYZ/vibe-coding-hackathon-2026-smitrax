#!/usr/bin/env node
/**
 * Build docs/pitch-deck.pptx from docs/pitch-deck.html.
 *
 * Strategy: launch the system Chrome via puppeteer-core, scroll to each slide
 * at 1920x1080 (deviceScaleFactor 2 for crispness), screenshot, then embed the
 * four PNGs full-bleed into a 16:9 PowerPoint via pptxgenjs.
 *
 * Why this approach: it guarantees the .pptx looks EXACTLY like the HTML deck
 * (Cursor-Orange accent, Inter + JetBrains Mono, hairline borders, the pipeline,
 * the terminal proof). The slides aren't editable as text in PowerPoint - but
 * for hackathon submission and screen-share that's a feature, not a bug. The
 * authoritative editable source remains docs/pitch-deck.html.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import puppeteer from "puppeteer-core";
import PptxGenJS from "pptxgenjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const deckHtml = path.join(repoRoot, "docs", "pitch-deck.html");
const outFile = path.join(repoRoot, "docs", "pitch-deck.pptx");

const CHROME_CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"
];
const executablePath = CHROME_CANDIDATES.find(existsSync);
if (!executablePath) throw new Error("No system Chrome or Edge found. Install Chrome or set CHROME_BIN.");

const W = 1920;
const H = 1080;

console.log("[deck] launching", path.basename(executablePath));
const browser = await puppeteer.launch({
  executablePath,
  headless: "new",
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=none"]
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 2 });
  await page.goto(pathToFileURL(deckHtml).href, { waitUntil: "networkidle0", timeout: 60_000 });
  // Wait for fonts to load and any initial animations to settle.
  await page.evaluateHandle("document.fonts.ready");
  await new Promise((r) => setTimeout(r, 800));

  const slideCount = await page.evaluate(() => document.querySelectorAll(".slide").length);
  console.log("[deck] slides found:", slideCount);

  const buffers = [];
  for (let i = 0; i < slideCount; i++) {
    await page.evaluate((idx) => {
      const target = document.querySelectorAll(".slide")[idx];
      target.scrollIntoView({ behavior: "instant", block: "start" });
      // Force the IntersectionObserver-driven entry animation to land NOW.
      document.querySelectorAll(".slide").forEach((s, k) => s.classList.toggle("in-view", k === idx));
    }, i);
    // Allow the staggered entry transitions (up to ~1100ms) to finish.
    await new Promise((r) => setTimeout(r, 1400));
    const buf = await page.screenshot({
      clip: { x: 0, y: 0, width: W, height: H },
      type: "png"
    });
    buffers.push(buf);
    console.log(`[deck] captured slide ${i + 1}/${slideCount}`);
  }

  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "DECK_16x9", width: 13.333, height: 7.5 });
  pptx.layout = "DECK_16x9";
  pptx.title = "PatchPilot - Hackathon Pitch Deck (Phase 1)";
  pptx.author = "PatchPilot";
  pptx.company = "PatchPilot";

  for (const buf of buffers) {
    const slide = pptx.addSlide();
    slide.background = { color: "0D0D0C" };
    slide.addImage({
      data: "image/png;base64," + buf.toString("base64"),
      x: 0,
      y: 0,
      w: 13.333,
      h: 7.5
    });
  }

  await pptx.writeFile({ fileName: outFile });
  console.log("[deck] wrote", outFile);
} finally {
  await browser.close();
}
