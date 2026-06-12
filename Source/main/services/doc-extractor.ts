import path from 'path';

import mammoth from 'mammoth';
import ExcelJS from 'exceljs';

async function extractDocx(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

function cellValueToString(value: ExcelJS.CellValue): string {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    if ('error' in value) return value.error;
    if ('richText' in value) return value.richText.map((rt) => rt.text).join('');
    if ('formula' in value || 'sharedFormula' in value) {
      const { result } = value as ExcelJS.CellFormulaValue;
      return result != null ? cellValueToString(result) : '';
    }
    if ('text' in value) return value.text; // hyperlink
  }
  return String(value);
}

async function extractXlsx(buffer: Buffer): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  // Cast required: @types/node Buffer<ArrayBufferLike> vs ExcelJS's ungeneric Buffer
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const lines: string[] = [];
  workbook.eachSheet((sheet) => {
    lines.push(`=== ${sheet.name} ===`);
    sheet.eachRow((row) => {
      const cells: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell) => {
        // Only the top-left cell of a merged range carries the value; the rest
        // would otherwise repeat it across every cell in the range.
        if (cell.isMerged && cell.master.address !== cell.address) {
          cells.push('');
          return;
        }
        cells.push(cellValueToString(cell.value));
      });
      lines.push(cells.join('\t'));
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
