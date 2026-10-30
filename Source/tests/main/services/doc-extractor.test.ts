import { describe, expect, it, vi } from 'vitest';
import ExcelJS from 'exceljs';
import mammoth from 'mammoth';

import { extractTextFromBuffer } from '../../../main/services/doc-extractor';

async function workbookBuffer(build: (wb: ExcelJS.Workbook) => void): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  build(wb);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe('extractTextFromBuffer', () => {
  it('extracts raw text from Word documents', async () => {
    const extract = vi
      .spyOn(mammoth, 'extractRawText')
      .mockResolvedValue({ value: 'Word text', messages: [] });

    await expect(extractTextFromBuffer(Buffer.from('docx'), 'Contract.DOCX')).resolves.toBe(
      'Word text'
    );
    await expect(extractTextFromBuffer(Buffer.from('doc'), 'old.doc')).resolves.toBe('Word text');
    expect(extract).toHaveBeenCalledTimes(2);
  });

  it('renders every sheet of a workbook as tab-separated rows', async () => {
    const buffer = await workbookBuffer((wb) => {
      const sheet = wb.addWorksheet('Invoices');
      sheet.addRow(['Name', 42, new Date('2026-03-04T00:00:00Z')]);
      sheet.getCell('A2').value = { richText: [{ text: 'Rich ' }, { text: 'text' }] };
      sheet.getCell('B2').value = { formula: 'B1*2', result: 84 };
      sheet.getCell('C2').value = { formula: 'NOW()' } as ExcelJS.CellFormulaValue;
      sheet.getCell('A3').value = { text: 'Docs', hyperlink: 'https://example.com' };
      sheet.getCell('B3').value = { error: '#DIV/0!' } as ExcelJS.CellErrorValue;
      sheet.getCell('A4').value = 'Merged';
      sheet.mergeCells('A4:B4');
      wb.addWorksheet('Empty');
    });

    const text = await extractTextFromBuffer(buffer, 'book.xlsx');

    expect(text.split('\n')).toEqual([
      '=== Invoices ===',
      'Name\t42\t2026-03-04',
      'Rich text\t84\t',
      'Docs\t#DIV/0!',
      'Merged\t',
      '=== Empty ===',
    ]);
  });

  it('strips markup, scripts and styles from HTML and decodes entities', async () => {
    const html =
      '<html><head><style>p { color: red; }</style><script type="x">alert(1)</script></head>' +
      '<body><p>Tom&nbsp;&amp;&nbsp;Jerry</p>\n<p>&lt;b&gt; &quot;quoted&quot; it&#39;s</p></body></html>';

    await expect(extractTextFromBuffer(Buffer.from(html), 'page.HTM')).resolves.toBe(
      `Tom & Jerry <b> "quoted" it's`
    );
    await expect(extractTextFromBuffer(Buffer.from('<p>x</p>'), 'page.html')).resolves.toBe('x');
  });

  it('rejects file types it has no extractor for', async () => {
    await expect(extractTextFromBuffer(Buffer.from(''), 'scan.pdf')).rejects.toThrow(
      'No local extractor available for ".pdf"'
    );
  });
});
