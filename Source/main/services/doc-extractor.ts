import path from 'path';

import mammoth from 'mammoth';
import ExcelJS from 'exceljs';

async function extractDocx(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

async function extractXlsx(buffer: Buffer): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  // Cast required: @types/node Buffer<ArrayBufferLike> vs ExcelJS's ungeneric Buffer
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const lines: string[] = [];
  workbook.eachSheet((sheet) => {
    lines.push(`=== ${sheet.name} ===`);
    sheet.eachRow((row) => {
      const values = (row.values as ExcelJS.CellValue[]).slice(1); // index 0 is always null in exceljs
      lines.push(values.map((v) => (v != null ? String(v) : '')).join('\t'));
    });
  });
  return lines.join('\n');
}

function extractHtml(buffer: Buffer): string {
  return buffer
    .toString('utf-8')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export async function extractTextFromBuffer(buffer: Buffer, filename: string): Promise<string> {
  const ext = path.extname(filename).toLowerCase();
  switch (ext) {
    case '.doc':
    case '.docx':
      return extractDocx(buffer);
    case '.xlsx':
      return extractXlsx(buffer);
    case '.html':
    case '.htm':
      return extractHtml(buffer);
    default:
      throw new Error(`No local extractor available for "${ext}"`);
  }
}
