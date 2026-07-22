// ═══════════════════════════════════════════════════════════════════════
// src/lib/domicili/scanCompress.ts
// ═══════════════════════════════════════════════════════════════════════
//
// Compressione delle cartelle cartacee acquisite dall'app.
//
// DUE PERCORSI, con pesi molto diversi:
//
//   • FOTO (il caso normale: si fotografano le pagine con l'iPad)
//     Ogni scatto viene ridimensionato al lato lungo utile per un A4
//     leggibile e ricompresso in JPEG; le pagine vengono poi assemblate
//     in un UNICO PDF. Una cartella di 8 scatti da ~4 MB l'uno esce
//     tipicamente sotto il mezzo megabyte in totale.
//
//   • PDF GIÀ ESISTENTE
//     Ricomprimere davvero un PDF richiederebbe di rasterizzarne le
//     pagine, cioè una libreria di rendering che il progetto non ha.
//     Qui si fa l'unica cosa onesta e a costo zero: riscrittura con
//     object stream compression via pdf-lib, che recupera qualcosa sui
//     file prodotti da scanner e app di scansione. Se il guadagno è
//     nullo si tiene l'originale.
// ═══════════════════════════════════════════════════════════════════════

/** Lato lungo massimo di una pagina fotografata: sopra i 2000px non si
    guadagna leggibilità su un A4 scritto a penna, si guadagna solo peso. */
const MAX_LATO = 2000;
const JPEG_Q = 0.72;

export type PaginaCompressa = {
  dataUrl: string;
  w: number;
  h: number;
  bytes: number;
};

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result || ""));
    r.onerror = () => rej(new Error(`Lettura di ${file.name} fallita`));
    r.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error("Formato immagine non supportato"));
    i.src = src;
  });
}

/** Ridimensiona e ricomprime uno scatto. */
export async function comprimiPagina(file: File): Promise<PaginaCompressa> {
  const img = await loadImage(await readAsDataUrl(file));
  let { width, height } = img;
  if (width > MAX_LATO || height > MAX_LATO) {
    const s = Math.min(MAX_LATO / width, MAX_LATO / height);
    width = Math.round(width * s);
    height = Math.round(height * s);
  }
  const cv = document.createElement("canvas");
  cv.width = width; cv.height = height;
  const ctx = cv.getContext("2d");
  if (!ctx) throw new Error("Canvas non disponibile su questo browser");
  // fondo bianco: le foto di fogli con trasparenza (PNG) non escono nere
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  const dataUrl = cv.toDataURL("image/jpeg", JPEG_Q);
  const bytes = Math.round((dataUrl.length - dataUrl.indexOf(",") - 1) * 0.75);
  return { dataUrl, w: width, h: height, bytes };
}

/** Assembla le pagine compresse in un unico PDF A4 (una pagina per foto). */
export async function paginePdf(pagine: PaginaCompressa[]): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const PW = 210, PH = 297, M = 6;
  pagine.forEach((p, i) => {
    if (i > 0) doc.addPage();
    const maxW = PW - M * 2, maxH = PH - M * 2;
    const ratio = Math.min(maxW / p.w, maxH / p.h);
    const w = p.w * ratio, h = p.h * ratio;
    doc.addImage(p.dataUrl, "JPEG", (PW - w) / 2, (PH - h) / 2, w, h, undefined, "FAST");
  });
  return doc.output("blob");
}

/** Riscrive un PDF con compressione degli object stream. Se non si
    guadagna nulla restituisce l'originale, senza fingere miglioramenti. */
export async function ottimizzaPdf(file: File): Promise<{ blob: Blob; pagine: number }> {
  const buf = await file.arrayBuffer();
  try {
    const { PDFDocument } = await import("pdf-lib");
    const src = await PDFDocument.load(buf, { ignoreEncryption: true });
    const pagine = src.getPageCount();
    const out = await src.save({ useObjectStreams: true });
    const blob = new Blob([out as unknown as BlobPart], { type: "application/pdf" });
    if (blob.size < file.size) return { blob, pagine };
    return { blob: file, pagine };
  } catch {
    // PDF protetto o malformato: si carica com'è, meglio che perderlo
    return { blob: file, pagine: 0 };
  }
}

export function kb(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
