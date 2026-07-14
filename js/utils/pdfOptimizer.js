const MIN_GAIN_RATIO = 0.02;
const RASTER_MIN_GAIN_RATIO = 0.08;
const MAX_BROWSER_OPTIMIZE_MB = 20;
const MAX_RASTER_OPTIMIZE_MB = 18;
const MAX_RASTER_PAGES = 24;
const PDF_LIB_URL = "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm";
const PDFJS_URL = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.mjs";
const PDFJS_WORKER_URL = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.mjs";

let pdfLibPromise;
let pdfJsPromise;

export async function optimizePdfFile(file) {
  if (!isPdfFile(file)) {
    return { file, optimized: false, reason: "unsupported" };
  }

  if (file.size > MAX_BROWSER_OPTIMIZE_MB * 1024 * 1024) {
    return { file, optimized: false, reason: "too-large" };
  }

  const bytes = await file.arrayBuffer();
  if (hasDigitalSignatureMarker(bytes)) {
    return { file, optimized: false, reason: "signed-pdf" };
  }

  try {
    const { PDFDocument } = await loadPdfLib();
    const pdf = await PDFDocument.load(bytes, {
      ignoreEncryption: false,
      updateMetadata: false
    });
    const output = await pdf.save({
      useObjectStreams: true,
      addDefaultPage: false,
      updateFieldAppearances: false
    });

    const losslessResult = optimizedFileFromBytes(file, output, MIN_GAIN_RATIO);
    if (losslessResult.optimized) return losslessResult;

    const rasterResult = await optimizeScannedPdf(file, bytes);
    if (rasterResult.optimized) return rasterResult;

    return { file, optimized: false, reason: rasterResult.reason || "small-gain" };
  } catch (error) {
    console.warn("No se pudo optimizar el PDF.", error);
    return { file, optimized: false, reason: "failed" };
  }
}

async function optimizeScannedPdf(file, bytes) {
  if (file.size > MAX_RASTER_OPTIMIZE_MB * 1024 * 1024) {
    return { file, optimized: false, reason: "raster-too-large" };
  }

  try {
    const pdfjs = await loadPdfJs();
    const { PDFDocument } = await loadPdfLib();
    const sourcePdf = await pdfjs.getDocument({ data: bytes.slice(0) }).promise;
    if (sourcePdf.numPages > MAX_RASTER_PAGES) {
      await sourcePdf.destroy?.();
      return { file, optimized: false, reason: "too-many-pages" };
    }

    const hasReadableText = await pdfHasReadableText(sourcePdf);
    if (hasReadableText) {
      await sourcePdf.destroy?.();
      return { file, optimized: false, reason: "text-pdf" };
    }

    const optimizedPdf = await PDFDocument.create();
    for (let pageNumber = 1; pageNumber <= sourcePdf.numPages; pageNumber += 1) {
      const page = await sourcePdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const pageImage = await renderPageAsJpeg(page, viewport);
      const embeddedImage = await optimizedPdf.embedJpg(pageImage);
      const outputPage = optimizedPdf.addPage([viewport.width, viewport.height]);
      outputPage.drawImage(embeddedImage, { x: 0, y: 0, width: viewport.width, height: viewport.height });
      page.cleanup?.();
    }

    await sourcePdf.destroy?.();
    const output = await optimizedPdf.save({ useObjectStreams: true, addDefaultPage: false });
    return optimizedFileFromBytes(file, output, RASTER_MIN_GAIN_RATIO, "scanned-raster");
  } catch (error) {
    console.warn("No se pudo recomprimir el PDF escaneado.", error);
    return { file, optimized: false, reason: "raster-failed" };
  }
}

async function loadPdfLib() {
  pdfLibPromise ||= import(PDF_LIB_URL);
  return pdfLibPromise;
}

async function loadPdfJs() {
  if (!pdfJsPromise) {
    pdfJsPromise = import(PDFJS_URL).then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
      return pdfjs;
    });
  }
  return pdfJsPromise;
}

async function pdfHasReadableText(pdf) {
  let chars = 0;
  const pagesToCheck = Math.min(pdf.numPages, 4);
  for (let pageNumber = 1; pageNumber <= pagesToCheck; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const text = await page.getTextContent().catch(() => ({ items: [] }));
    chars += (text.items || []).reduce((total, item) => total + String(item.str || "").trim().length, 0);
    page.cleanup?.();
    if (chars >= 120) return true;
  }
  return false;
}

async function renderPageAsJpeg(page, viewport) {
  const scale = rasterScaleForPage(viewport.width, viewport.height);
  const renderViewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(renderViewport.width);
  canvas.height = Math.ceil(renderViewport.height);
  const context = canvas.getContext("2d", { alpha: false });
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: context, viewport: renderViewport }).promise;
  return dataUrlToBytes(canvas.toDataURL("image/jpeg", 0.78));
}

function rasterScaleForPage(width, height) {
  const maxPixels = 3500000;
  const pixels = Math.max(1, width * height);
  return clamp(Math.sqrt(maxPixels / pixels), 1.35, 2.05);
}

function optimizedFileFromBytes(file, output, minGainRatio, method = "lossless") {
  const optimizedSize = output.byteLength;
  const gain = 1 - (optimizedSize / file.size);
  if (optimizedSize <= 0 || optimizedSize >= file.size || gain < minGainRatio) {
    return { file, optimized: false, reason: "small-gain" };
  }

  const optimizedFile = new File([output], file.name, {
    type: "application/pdf",
    lastModified: file.lastModified || Date.now()
  });

  return {
    file: optimizedFile,
    optimized: true,
    originalSize: file.size,
    optimizedSize,
    method
  };
}

function dataUrlToBytes(dataUrl) {
  const base64 = String(dataUrl || "").split(",")[1] || "";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function isPdfFile(file) {
  const name = String(file?.name || "").toLowerCase();
  return file?.type === "application/pdf" || name.endsWith(".pdf");
}

function hasDigitalSignatureMarker(buffer) {
  const sampleSize = Math.min(buffer.byteLength, 1024 * 1024);
  const first = new Uint8Array(buffer, 0, sampleSize);
  const lastStart = Math.max(0, buffer.byteLength - sampleSize);
  const last = new Uint8Array(buffer, lastStart, buffer.byteLength - lastStart);
  const decoder = new TextDecoder("latin1");
  const text = `${decoder.decode(first)} ${decoder.decode(last)}`;
  return text.includes("/ByteRange") || text.includes("/Sig") || text.includes("/DocMDP");
}
