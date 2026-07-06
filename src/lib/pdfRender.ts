/**
 * Рендер страниц PDF в JPEG для AI Vision (компактные, до ~300 KB/стр.).
 */

import { readFile } from "fs/promises";
import path from "path";

const MAX_PAGES = 24;
/** Масштаб рендера — 1.0 достаточно для OCR, PNG 1.6 давал 3+ MB и рвал Groq */
const VIEWPORT_SCALE = 1.0;
const MAX_VISION_PX = 1400;
const JPEG_QUALITY = 85;

/** Какие страницы РУ отправлять в Vision: титул + начало приложения + хвост (часто таблица изделий) */
export function selectRuPdfPageNumbers(totalPages: number, maxPages: number): number[] {
  if (totalPages <= 0) return [];
  if (totalPages <= maxPages) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const picked = new Set<number>([1, 2, 3]);
  const tailCount = Math.max(6, maxPages - picked.size);
  for (let p = totalPages - tailCount + 1; p <= totalPages; p++) {
    if (p > 0) picked.add(p);
  }

  return [...picked].sort((a, b) => a - b).slice(0, maxPages);
}

function toPdfJsAssetUrl(relativeFromCwd: string): string {
  const abs = path.resolve(process.cwd(), relativeFromCwd);
  return abs.replace(/\\/g, "/") + "/";
}

type CanvasAndContext = {
  canvas: { toBuffer: (mime: string, quality?: number) => Buffer };
  context: unknown;
};

type CanvasFactory = {
  create: (w: number, h: number) => CanvasAndContext;
  destroy: (entry: CanvasAndContext) => void;
};

type PdfDocument = {
  numPages: number;
  canvasFactory?: CanvasFactory;
  getPage: (n: number) => Promise<PdfPage>;
  destroy: () => Promise<void>;
};

type PdfPage = {
  getViewport: (p: { scale: number }) => { width: number; height: number };
  render: (p: Record<string, unknown>) => { promise: Promise<void> };
  cleanup: () => void;
};

let pdfjsGetDocument: ((params: Record<string, unknown>) => { promise: Promise<PdfDocument> }) | null = null;

async function loadPdfDocument(data: Uint8Array): Promise<PdfDocument> {
  if (!pdfjsGetDocument) {
    const mod = await import("pdfjs-dist/legacy/build/pdf.mjs");
    pdfjsGetDocument = mod.getDocument as unknown as NonNullable<typeof pdfjsGetDocument>;
  }

  return pdfjsGetDocument!({
    data,
    cMapUrl: toPdfJsAssetUrl("node_modules/pdfjs-dist/cmaps"),
    cMapPacked: true,
    standardFontDataUrl: toPdfJsAssetUrl("node_modules/pdfjs-dist/standard_fonts"),
    disableFontFace: true,
    useSystemFonts: false,
    verbosity: 0,
  }).promise;
}

export async function renderPdfPages(
  filePath: string,
  maxPages = MAX_PAGES,
  pageNumbers?: number[]
): Promise<Array<{ pageNumber: number; dataUrl: string }>> {
  const buffer = await readFile(filePath);
  const data = new Uint8Array(buffer);
  const doc = await loadPdfDocument(data);

  const canvasFactory = doc.canvasFactory;
  if (!canvasFactory?.create) {
    await doc.destroy();
    throw new Error("pdf.js canvas factory недоступен — установите @napi-rs/canvas");
  }

  const nums =
    pageNumbers && pageNumbers.length > 0
      ? pageNumbers.filter((p) => p >= 1 && p <= doc.numPages)
      : selectRuPdfPageNumbers(doc.numPages, maxPages);

  const results: Array<{ pageNumber: number; dataUrl: string }> = [];

  try {
    for (const pageNum of nums) {
      const page = await doc.getPage(pageNum);
      const base = page.getViewport({ scale: 1 });
      let scale = VIEWPORT_SCALE;
      if (base.width * scale > MAX_VISION_PX) {
        scale = MAX_VISION_PX / base.width;
      }
      const viewport = page.getViewport({ scale });
      const width = Math.floor(viewport.width);
      const height = Math.floor(viewport.height);

      if (width <= 0 || height <= 0) {
        page.cleanup();
        continue;
      }

      const canvasAndContext = canvasFactory.create(width, height);
      try {
        await page.render({
          canvasContext: canvasAndContext.context,
          viewport,
          canvas: canvasAndContext.canvas,
        }).promise;

        const jpeg = canvasAndContext.canvas.toBuffer("image/jpeg", JPEG_QUALITY);
        results.push({
          pageNumber: pageNum,
          dataUrl: `data:image/jpeg;base64,${jpeg.toString("base64")}`,
        });
      } finally {
        page.cleanup();
        if (canvasAndContext.canvas) {
          canvasFactory.destroy(canvasAndContext);
        }
      }
    }
  } finally {
    await doc.destroy();
  }

  return results;
}

export async function getPdfPageCount(filePath: string): Promise<number> {
  const buffer = await readFile(filePath);
  const doc = await loadPdfDocument(new Uint8Array(buffer));
  const n = doc.numPages;
  await doc.destroy();
  return n;
}
