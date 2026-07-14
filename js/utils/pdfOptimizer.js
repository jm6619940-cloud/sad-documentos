const MIN_GAIN_RATIO = 0.02;
const MAX_BROWSER_OPTIMIZE_MB = 20;
const PDF_LIB_URL = "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm";

let pdfLibPromise;

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

    const optimizedSize = output.byteLength;
    const gain = 1 - (optimizedSize / file.size);
    if (optimizedSize <= 0 || optimizedSize >= file.size || gain < MIN_GAIN_RATIO) {
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
      optimizedSize
    };
  } catch (error) {
    console.warn("No se pudo optimizar el PDF sin perdida.", error);
    return { file, optimized: false, reason: "failed" };
  }
}

async function loadPdfLib() {
  pdfLibPromise ||= import(PDF_LIB_URL);
  return pdfLibPromise;
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
