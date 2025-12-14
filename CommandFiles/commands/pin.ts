// @ts-check

/**
 * @type {CommandMeta}
 */
export const meta = {
  name: "pinterest",
  description: "Search images on Pinterest with interactive canvas.",
  author: "Christus",
  version: "1.0.0",
  usage: "{prefix}{name} <query> [-count]",
  category: "Image",
  permissions: [0],
  noPrefix: false,
  waitingTime: 10,
  requirement: "3.0.0",
  otherNames: ["pin"],
  icon: "📌",
  noLevelUI: true,
  noWeb: true,
};

import axios from "axios";
import fs from "fs-extra";
import path from "path";
import { createCanvas, loadImage } from "canvas";
import { defineEntry } from "@cass/define";

const CACHE_DIR = path.join(process.cwd(), "cache", "pinterest");
const PIN_API =
  "https://egret-driving-cattle.ngrok-free.app/api/pin";

/* -------------------- CANVAS -------------------- */

async function generatePinterestCanvas(
  imageObjects: { url: string; originalIndex: number }[],
  query: string,
  page: number,
  totalPages: number
): Promise<{ outputPath: string; displayedMap: number[] }> {
  const canvasWidth = 800;
  const canvasHeight = 1600;

  const canvas = createCanvas(canvasWidth, canvasHeight);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#1e1e1e";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  ctx.fillStyle = "#ffffff";
  ctx.font = "24px Arial";
  ctx.fillText("🔍 Recherche Pinterest", 20, 45);

  ctx.font = "16px Arial";
  ctx.fillStyle = "#b0b0b0";
  ctx.fillText(
    `Résultats pour "${query}" (${imageObjects.length} images)`,
    20,
    75
  );

  const numColumns = 3;
  const padding = 15;
  const columnWidth =
    (canvasWidth - padding * (numColumns + 1)) / numColumns;

  const columnHeights = Array(numColumns).fill(100);

  const loaded = await Promise.all(
    imageObjects.map((obj) =>
      loadImage(obj.url)
        .then((img) => ({ img, originalIndex: obj.originalIndex }))
        .catch(() => null)
    )
  );

  const valid = loaded.filter(Boolean) as {
    img: any;
    originalIndex: number;
  }[];

  const displayedMap: number[] = [];
  let displayNumber = 0;

  for (const { img, originalIndex } of valid) {
    const colIndex = columnHeights.indexOf(
      Math.min(...columnHeights)
    );

    const x = padding + colIndex * (columnWidth + padding);
    const y = columnHeights[colIndex] + padding;

    const scale = columnWidth / img.width;
    const height = img.height * scale;

    ctx.drawImage(img, x, y, columnWidth, height);

    displayNumber++;
    displayedMap.push(originalIndex);

    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(x, y, 44, 22);

    ctx.fillStyle = "#fff";
    ctx.font = "bold 13px Arial";
    ctx.textAlign = "center";
    ctx.fillText(`#${displayNumber}`, x + 22, y + 15);

    columnHeights[colIndex] += height + padding;
  }

  ctx.fillStyle = "#fff";
  ctx.font = "bold 16px Arial";
  ctx.textAlign = "center";
  ctx.fillText(
    `Page ${page}/${totalPages}`,
    canvasWidth / 2,
    Math.max(...columnHeights) + 40
  );

  await fs.ensureDir(CACHE_DIR);
  const outputPath = path.join(
    CACHE_DIR,
    `pin_${Date.now()}.png`
  );
  fs.writeFileSync(outputPath, canvas.toBuffer("image/png"));

  return { outputPath, displayedMap };
}

/* -------------------- ENTRY -------------------- */

export const entry = defineEntry(
  async ({ input, output, args }) => {
    let count: number | null = null;

    const countArg = args.find((a) => /^-\d+$/.test(a));
    if (countArg) {
      count = parseInt(countArg.slice(1), 10);
      args = args.filter((a) => a !== countArg);
    }

    const query = args.join(" ").trim();
    if (!query) {
      return output.reply("❌ Please provide a search query.");
    }

    await output.reply("🔍 Searching Pinterest...");

    try {
      const { data } = await axios.get<any>(
        `${PIN_API}?query=${encodeURIComponent(query)}&num=90`
      );

      const allImageUrls: string[] = data?.results || [];
      if (!allImageUrls.length) {
        return output.reply(`No images found for "${query}".`);
      }

      // 🔹 DIRECT SEND MODE
      if (count) {
        const urls = allImageUrls.slice(0, count);
        const streams = await Promise.all(
          urls.map((u) =>
            global.utils.getStreamFromURL(u).catch(() => null)
          )
        );

        const valid = streams.filter(Boolean);
        return output.reply({
          body: `📌 ${valid.length} image(s) for "${query}"`,
          attachment: valid,
        });
      }

      // 🔹 CANVAS MODE
      const imagesPerPage = 21;
      const totalPages = Math.ceil(
        allImageUrls.length / imagesPerPage
      );

      const firstPageImages = allImageUrls
        .slice(0, imagesPerPage)
        .map((url, i) => ({ url, originalIndex: i }));

      const { outputPath, displayedMap } =
        await generatePinterestCanvas(
          firstPageImages,
          query,
          1,
          totalPages
        );

      const msg = await output.reply({
        body:
          `🖼️ ${allImageUrls.length} images found for "${query}".\n` +
          `Reply with a number (from canvas) or "next".`,
        attachment: fs.createReadStream(outputPath),
      });

      fs.unlink(outputPath).catch(() => {});

      input.setReply(msg.messageID, {
        key: "pinterest",
        id: input.senderID,
        allImageUrls,
        query,
        imagesPerPage,
        currentPage: 1,
        totalPages,
        displayedMap,
      });
    } catch (err) {
      console.error(err);
      output.reply("❌ Pinterest search failed.");
    }
  }
);

/* -------------------- REPLY -------------------- */

export async function reply({
  input,
  output,
  repObj,
  detectID,
}: any) {
  const {
    id,
    allImageUrls,
    query,
    imagesPerPage,
    currentPage,
    totalPages,
    displayedMap,
  } = repObj;

  if (input.senderID !== id) return;

  const text = input.body.trim().toLowerCase();

  // NEXT PAGE
  if (text === "next") {
    if (currentPage >= totalPages) {
      return output.reply("You are already on the last page.");
    }

    const nextPage = currentPage + 1;
    const start = (nextPage - 1) * imagesPerPage;
    const end = Math.min(
      start + imagesPerPage,
      allImageUrls.length
    );

    const imgs = allImageUrls
      .slice(start, end)
      .map((u, i) => ({
        url: u,
        originalIndex: start + i,
      }));

    const { outputPath, displayedMap: map } =
      await generatePinterestCanvas(
        imgs,
        query,
        nextPage,
        totalPages
      );

    const msg = await output.reply({
      body:
        `🖼️ Page ${nextPage}/${totalPages}\n` +
        `Reply with a number or "next".`,
      attachment: fs.createReadStream(outputPath),
    });

    fs.unlink(outputPath).catch(() => {});
    input.delReply(String(detectID));

    input.setReply(msg.messageID, {
      key: "pinterest",
      id,
      allImageUrls,
      query,
      imagesPerPage,
      currentPage: nextPage,
      totalPages,
      displayedMap: map,
    });
    return;
  }

  // NUMBER SELECTION
  const number = parseInt(text, 10);
  if (!isNaN(number) && number > 0) {
    if (!displayedMap[number - 1]) {
      return output.reply("Invalid image number.");
    }

    const imageUrl = allImageUrls[displayedMap[number - 1]];
    const stream = await global.utils
      .getStreamFromURL(imageUrl)
      .catch(() => null);

    if (!stream) {
      return output.reply("Failed to fetch image.");
    }

    input.delReply(String(detectID));
    return output.reply({
      body: `📌 Image #${number} for "${query}"`,
      attachment: stream,
    });
  }

  return output.reply(
    'Reply with a number (from canvas) or "next".'
  );
}
