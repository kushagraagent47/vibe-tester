// Synthetic test-file generator — zero dependencies (Node built-ins only).
// Lets the browser agent fabricate a file on demand to satisfy upload fields:
//   genFile({ kind: "pdf", text: "Invoice #123" })  ->  { name, mimeType, buffer }
import zlib from "node:zlib";

// ---- PDF (valid single-page PDF with correct cross-reference table) ---------
export function buildPdf(text = "flow-tester synthetic PDF") {
  const esc = String(text).replace(/([()\\])/g, "\\$1").slice(0, 2000);
  const objs = [];
  objs[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objs[2] = "<< /Type /Pages /Kids [3 0 R] /Count 1 >>";
  objs[3] =
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] " +
    "/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>";
  objs[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  const stream = `BT /F1 24 Tf 72 700 Td (${esc}) Tj ET`;
  objs[5] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;

  let pdf = "%PDF-1.4\n";
  const offsets = [];
  for (let i = 1; i <= 5; i++) {
    offsets[i] = Buffer.byteLength(pdf, "latin1");
    pdf += `${i} 0 obj\n${objs[i]}\nendobj\n`;
  }
  const xrefPos = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 6\n0000000000 65535 f \n`;
  for (let i = 1; i <= 5; i++) pdf += String(offsets[i]).padStart(10, "0") + " 00000 n \n";
  pdf += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
  return Buffer.from(pdf, "latin1");
}

// ---- PNG (valid solid-color RGB image) -------------------------------------
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (~c) >>> 0;
}
function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "latin1");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}
export function buildPng(width = 600, height = 400, rgb = [90, 140, 255]) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // color type 2 = truecolor RGB
  // 10,11,12 = compression/filter/interlace = 0
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x++) {
    row[1 + x * 3] = rgb[0];
    row[1 + x * 3 + 1] = rgb[1];
    row[1 + x * 3 + 2] = rgb[2];
  }
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([
    sig,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---- dispatcher ------------------------------------------------------------
const MIME = {
  pdf: "application/pdf",
  png: "image/png",
  txt: "text/plain",
  csv: "text/csv",
  json: "application/json",
};

export function genFile(spec = {}) {
  const kind = (spec.kind || "pdf").toLowerCase();
  const label = spec.text || "flow-tester synthetic test file";

  if (kind === "pdf") return { name: spec.name || "test.pdf", mimeType: MIME.pdf, buffer: buildPdf(label) };
  if (["png", "jpg", "jpeg", "image", "img"].includes(kind)) {
    // images are emitted as PNG regardless of requested extension
    return { name: spec.name || "test.png", mimeType: MIME.png, buffer: buildPng(spec.width, spec.height) };
  }
  if (kind === "csv") {
    const rows = spec.rows || 5;
    let csv = "id,name,email,amount\n";
    for (let i = 1; i <= rows; i++) csv += `${i},Test User ${i},user${i}@example.com,${(i * 9.99).toFixed(2)}\n`;
    return { name: spec.name || "test.csv", mimeType: MIME.csv, buffer: Buffer.from(csv, "utf8") };
  }
  if (kind === "json") {
    const body = spec.json ?? { hello: "world", generatedBy: "flow-tester" };
    return { name: spec.name || "test.json", mimeType: MIME.json, buffer: Buffer.from(JSON.stringify(body, null, 2), "utf8") };
  }
  // default: plain text
  return { name: spec.name || "test.txt", mimeType: MIME.txt, buffer: Buffer.from(label + "\n", "utf8") };
}
