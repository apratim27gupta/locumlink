import { readFile } from 'node:fs/promises';
import path from 'node:path';
import mammoth from 'mammoth';

export async function loadLegalDocumentHtml(filename: string): Promise<string> {
  const filePath = path.join(process.cwd(), 'public', 'documents', filename);
  const buffer = await readFile(filePath);
  const { value } = await mammoth.convertToHtml({ buffer });
  return value;
}
