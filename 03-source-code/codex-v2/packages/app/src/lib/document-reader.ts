// ============================================================================
// CodeEX v2 — Document Ingestion Engine
// Copyright 2026 TerraTech Systems. All rights reserved.
//
// Multi-format document reader for Gixsis data processing and context injection.
// Supported: PDF, Markdown, Plain Text, CSV, JSON, DOCX, XLSX
// ============================================================================

export interface DocumentContent {
  fileName: string;
  mimeType: string;
  text: string;
  pageCount?: number;
  wordCount: number;
  charCount: number;
}

// Supported file extensions → MIME types
const SUPPORTED_FORMATS: Record<string, string> = {
  ".pdf": "application/pdf",
  ".md": "text/markdown",
  ".txt": "text/plain",
  ".csv": "text/csv",
  ".json": "application/json",
  ".jsonl": "application/x-jsonlines",
  ".xml": "application/xml",
  ".html": "text/html",
  ".htm": "text/html",
  ".yaml": "text/yaml",
  ".yml": "text/yaml",
  ".toml": "text/toml",
  ".ini": "text/plain",
  ".cfg": "text/plain",
  ".log": "text/plain",
  ".ts": "text/typescript",
  ".tsx": "text/typescript",
  ".js": "text/javascript",
  ".jsx": "text/javascript",
  ".py": "text/x-python",
  ".rs": "text/x-rust",
  ".go": "text/x-go",
  ".cpp": "text/x-c++",
  ".c": "text/x-c",
  ".h": "text/x-c",
  ".java": "text/x-java",
  ".rb": "text/x-ruby",
  ".sh": "text/x-shellscript",
  ".bat": "text/x-bat",
  ".ps1": "text/x-powershell",
  ".sql": "text/x-sql",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

/** Check if a file extension is supported for ingestion. */
export function isSupportedFormat(fileName: string): boolean {
  const ext = getExtension(fileName);
  return ext in SUPPORTED_FORMATS;
}

/** Get all supported extensions. */
export function getSupportedExtensions(): string[] {
  return Object.keys(SUPPORTED_FORMATS);
}

function getExtension(fileName: string): string {
  const idx = fileName.lastIndexOf(".");
  return idx >= 0 ? fileName.substring(idx).toLowerCase() : "";
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/**
 * Read a file and extract its text content.
 * Dispatches to the appropriate reader based on file extension/type.
 */
export async function readDocument(file: File): Promise<DocumentContent> {
  const ext = getExtension(file.name);

  if (ext === ".pdf") {
    return readPDF(file);
  }
  if (ext === ".docx") {
    return readDOCX(file);
  }
  if (ext === ".xlsx") {
    return readXLSX(file);
  }
  // All text-based formats
  return readTextFile(file, ext);
}

/**
 * Read multiple files and return all their contents.
 */
export async function readDocuments(files: File[]): Promise<DocumentContent[]> {
  const results: DocumentContent[] = [];
  for (const file of files) {
    if (isSupportedFormat(file.name)) {
      try {
        const content = await readDocument(file);
        results.push(content);
      } catch (err: any) {
        results.push({
          fileName: file.name,
          mimeType: file.type || "unknown",
          text: `[Error reading ${file.name}: ${err.message}]`,
          wordCount: 0,
          charCount: 0,
        });
      }
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Text-based file reader (MD, TXT, CSV, JSON, source code, etc.)
// ---------------------------------------------------------------------------

async function readTextFile(file: File, ext: string): Promise<DocumentContent> {
  const text = await file.text();
  const mime = SUPPORTED_FORMATS[ext] || "text/plain";

  // For JSON, pretty-print if compact
  let content = text;
  if (ext === ".json") {
    try {
      const parsed = JSON.parse(text);
      content = JSON.stringify(parsed, null, 2);
    } catch {
      // Not valid JSON — keep raw
    }
  }

  // For CSV, format as a readable table summary
  if (ext === ".csv") {
    const lines = text.split("\n").filter(Boolean);
    const header = lines[0] || "";
    content = `CSV File: ${file.name}\nColumns: ${header}\nRows: ${lines.length - 1}\n\n${text}`;
  }

  return {
    fileName: file.name,
    mimeType: mime,
    text: content,
    wordCount: countWords(content),
    charCount: content.length,
  };
}

// ---------------------------------------------------------------------------
// PDF reader using pdf.js (loaded dynamically from CDN)
// ---------------------------------------------------------------------------

let pdfjs: any = null;

async function loadPDFJS(): Promise<any> {
  if (pdfjs) return pdfjs;

  // Dynamically load pdf.js from CDN
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.2.67/pdf.min.mjs";
    script.type = "module";

    // Use a different approach — load via dynamic import
    import("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.2.67/pdf.min.mjs")
      .then((mod) => {
        pdfjs = mod;
        // Set worker source
        pdfjs.GlobalWorkerOptions.workerSrc =
          "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.2.67/pdf.worker.min.mjs";
        resolve(pdfjs);
      })
      .catch(() => {
        // Fallback: try loading as a script tag with globalThis
        const fallbackScript = document.createElement("script");
        fallbackScript.src =
          "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.2.67/pdf.min.js";
        fallbackScript.onload = () => {
          pdfjs = (globalThis as any).pdfjsLib;
          if (pdfjs) {
            pdfjs.GlobalWorkerOptions.workerSrc =
              "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.2.67/pdf.worker.min.js";
            resolve(pdfjs);
          } else {
            reject(new Error("pdf.js failed to load"));
          }
        };
        fallbackScript.onerror = () => reject(new Error("pdf.js CDN unavailable"));
        document.head.appendChild(fallbackScript);
      });
  });
}

async function readPDF(file: File): Promise<DocumentContent> {
  const lib = await loadPDFJS();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await lib.getDocument({ data: arrayBuffer }).promise;

  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item: any) => item.str)
      .join(" ");
    pages.push(pageText);
  }

  const fullText = pages.join("\n\n--- Page Break ---\n\n");

  return {
    fileName: file.name,
    mimeType: "application/pdf",
    text: fullText,
    pageCount: pdf.numPages,
    wordCount: countWords(fullText),
    charCount: fullText.length,
  };
}

// ---------------------------------------------------------------------------
// DOCX reader (basic extraction via ZIP + XML parsing)
// ---------------------------------------------------------------------------

async function readDOCX(file: File): Promise<DocumentContent> {
  // DOCX files are ZIP archives containing XML.
  // We extract document.xml and parse the text nodes.
  try {
    const arrayBuffer = await file.arrayBuffer();
    const blob = new Blob([arrayBuffer]);

    // Use the native DecompressionStream API if available
    if (typeof DecompressionStream === "undefined") {
      throw new Error("DecompressionStream not available — cannot parse DOCX in this browser");
    }

    // For DOCX parsing, we need to unzip. Use a minimal approach:
    // Read as ArrayBuffer, find document.xml in the ZIP, parse XML text.
    const text = await extractDOCXText(arrayBuffer);

    return {
      fileName: file.name,
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      text,
      wordCount: countWords(text),
      charCount: text.length,
    };
  } catch (err: any) {
    // Fallback: provide the raw content note
    return {
      fileName: file.name,
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      text: `[DOCX file: ${file.name} — ${(file.size / 1024).toFixed(1)} KB. Full parsing requires a ZIP library. Upload to Gixsis for server-side extraction.]`,
      wordCount: 0,
      charCount: 0,
    };
  }
}

async function extractDOCXText(buffer: ArrayBuffer): Promise<string> {
  // Minimal ZIP parser to find word/document.xml
  const view = new DataView(buffer);
  const entries = findZipEntries(view);

  const docEntry = entries.find(
    (e) => e.name === "word/document.xml"
  );
  if (!docEntry) {
    throw new Error("word/document.xml not found in DOCX archive");
  }

  const xmlBytes = new Uint8Array(buffer, docEntry.dataOffset, docEntry.compressedSize);

  // If stored (not compressed), decode directly
  if (docEntry.compressionMethod === 0) {
    const xmlText = new TextDecoder().decode(xmlBytes);
    return parseWordXML(xmlText);
  }

  // If deflated, use DecompressionStream
  const ds = new DecompressionStream("deflate-raw");
  const writer = ds.writable.getWriter();
  writer.write(xmlBytes);
  writer.close();

  const reader = ds.readable.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  const totalLen = chunks.reduce((acc, c) => acc + c.length, 0);
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  const xmlText = new TextDecoder().decode(result);
  return parseWordXML(xmlText);
}

interface ZipEntry {
  name: string;
  compressionMethod: number;
  compressedSize: number;
  dataOffset: number;
}

function findZipEntries(view: DataView): ZipEntry[] {
  const entries: ZipEntry[] = [];
  let offset = 0;

  while (offset < view.byteLength - 4) {
    const sig = view.getUint32(offset, true);
    if (sig !== 0x04034b50) break; // Local file header signature

    const compressionMethod = view.getUint16(offset + 8, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const nameLen = view.getUint16(offset + 26, true);
    const extraLen = view.getUint16(offset + 28, true);
    const name = new TextDecoder().decode(
      new Uint8Array(view.buffer, offset + 30, nameLen)
    );
    const dataOffset = offset + 30 + nameLen + extraLen;

    entries.push({ name, compressionMethod, compressedSize, dataOffset });
    offset = dataOffset + compressedSize;
  }

  return entries;
}

function parseWordXML(xml: string): string {
  // Extract text from <w:t> tags
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "application/xml");
  const textNodes = doc.getElementsByTagNameNS(
    "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
    "t"
  );

  const paragraphs: string[] = [];
  let currentPara = "";

  // Walk through parent <w:p> elements for paragraph grouping
  const paraNodes = doc.getElementsByTagNameNS(
    "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
    "p"
  );

  for (let i = 0; i < paraNodes.length; i++) {
    const tNodes = paraNodes[i].getElementsByTagNameNS(
      "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
      "t"
    );
    let paraText = "";
    for (let j = 0; j < tNodes.length; j++) {
      paraText += tNodes[j].textContent || "";
    }
    if (paraText) paragraphs.push(paraText);
  }

  return paragraphs.join("\n");
}

// ---------------------------------------------------------------------------
// XLSX reader (basic extraction — first sheet, tab-separated)
// ---------------------------------------------------------------------------

async function readXLSX(file: File): Promise<DocumentContent> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const text = await extractXLSXText(arrayBuffer);

    return {
      fileName: file.name,
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      text,
      wordCount: countWords(text),
      charCount: text.length,
    };
  } catch (err: any) {
    return {
      fileName: file.name,
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      text: `[XLSX file: ${file.name} — ${(file.size / 1024).toFixed(1)} KB. Full parsing requires a ZIP library. Upload to Gixsis for server-side extraction.]`,
      wordCount: 0,
      charCount: 0,
    };
  }
}

async function extractXLSXText(buffer: ArrayBuffer): Promise<string> {
  const view = new DataView(buffer);
  const entries = findZipEntries(view);

  // Get shared strings
  const sharedStringsEntry = entries.find((e) => e.name === "xl/sharedStrings.xml");
  let sharedStrings: string[] = [];

  if (sharedStringsEntry) {
    const xmlBytes = new Uint8Array(
      buffer,
      sharedStringsEntry.dataOffset,
      sharedStringsEntry.compressedSize
    );

    let xmlText: string;
    if (sharedStringsEntry.compressionMethod === 0) {
      xmlText = new TextDecoder().decode(xmlBytes);
    } else {
      xmlText = await decompressToString(xmlBytes);
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, "application/xml");
    const siNodes = doc.getElementsByTagName("si");
    for (let i = 0; i < siNodes.length; i++) {
      const tNodes = siNodes[i].getElementsByTagName("t");
      let val = "";
      for (let j = 0; j < tNodes.length; j++) {
        val += tNodes[j].textContent || "";
      }
      sharedStrings.push(val);
    }
  }

  // Get sheet1 data
  const sheet1Entry = entries.find((e) => e.name === "xl/worksheets/sheet1.xml");
  if (!sheet1Entry) {
    return "[No sheet1 found in XLSX]";
  }

  const sheetBytes = new Uint8Array(
    buffer,
    sheet1Entry.dataOffset,
    sheet1Entry.compressedSize
  );

  let sheetXml: string;
  if (sheet1Entry.compressionMethod === 0) {
    sheetXml = new TextDecoder().decode(sheetBytes);
  } else {
    sheetXml = await decompressToString(sheetBytes);
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(sheetXml, "application/xml");
  const rows = doc.getElementsByTagName("row");
  const lines: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const cells = rows[i].getElementsByTagName("c");
    const values: string[] = [];
    for (let j = 0; j < cells.length; j++) {
      const cell = cells[j];
      const type = cell.getAttribute("t");
      const vNode = cell.getElementsByTagName("v")[0];
      let val = vNode?.textContent || "";

      if (type === "s" && sharedStrings.length > 0) {
        const idx = parseInt(val, 10);
        val = sharedStrings[idx] ?? val;
      }

      values.push(val);
    }
    lines.push(values.join("\t"));
  }

  return lines.join("\n");
}

async function decompressToString(bytes: Uint8Array): Promise<string> {
  const ds = new DecompressionStream("deflate-raw");
  const writer = ds.writable.getWriter();
  writer.write(bytes);
  writer.close();

  const reader = ds.readable.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  const totalLen = chunks.reduce((acc, c) => acc + c.length, 0);
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return new TextDecoder().decode(result);
}

// ---------------------------------------------------------------------------
// Utility: Build context injection prompt from documents
// ---------------------------------------------------------------------------

/**
 * Build a context string from ingested documents for Gixsis prompt injection.
 * Truncates to maxChars to stay within context limits.
 */
export function buildDocumentContext(
  docs: DocumentContent[],
  maxChars = 50000
): string {
  if (docs.length === 0) return "";

  let context = "## Attached Documents\n\n";
  let remaining = maxChars;

  for (const doc of docs) {
    const header = `### ${doc.fileName} (${doc.wordCount} words, ${doc.charCount} chars${doc.pageCount ? `, ${doc.pageCount} pages` : ""})\n\n`;
    const body = doc.text.substring(0, remaining - header.length - 10);
    const truncated = body.length < doc.text.length ? "\n\n[... truncated ...]" : "";

    context += header + body + truncated + "\n\n";
    remaining -= header.length + body.length + truncated.length + 2;

    if (remaining <= 100) {
      context += "[Additional documents truncated due to context limit]\n";
      break;
    }
  }

  return context;
}
