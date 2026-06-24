/**
 * Рендер страниц PDF в PNG для AI Vision.
 * pdf-parse падает на Node 24+ (DataCloneError в worker) — используем pdfjs-dist напрямую.
 */

import { readFile } from "fs/promises";
import path from "path";

const MAX_PAGES = 12;
const VIEWPORT_SCALE = 1.6;

/** pdfjs требует URL с forward-slash и trailing slash (даже на Windows) */
function toPdfJsAssetUrl(relativeFromCwd: string): string {
  const abs = path.resolve(process.cwd(), relativeFromCwd);
  return abs.replace(/\\/g, "/") + "/";
}

type CanvasAndContext = {
  canvas: { toBuffer: (mime: string) => Buffer };
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
  maxPages = MAX_PAGES
): Promise<Array<{ pageNumber: number; dataUrl: string }>> {
  const buffer = await readFile(filePath);
  const data = new Uint8Array(buffer);
  const doc = await loadPdfDocument(data);

  const canvasFactory = doc.canvasFactory;
  if (!canvasFactory?.create) {
    await doc.destroy();
    throw new Error("pdf.js canvas factory недоступен — установите @napi-rs/canvas");
  }

  const pageCount = Math.min(doc.numPages, maxPages);
  const results: Array<{ pageNumber: number; dataUrl: string }> = [];

  try {
    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
      const page = await doc.getPage(pageNum);
      const viewport = page.getViewport({ scale: VIEWPORT_SCALE });
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

        const png = canvasAndContext.canvas.toBuffer("image/png");
        results.push({
          pageNumber: pageNum,
          dataUrl: `data:image/png;base64,${png.toString("base64")}`,
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
