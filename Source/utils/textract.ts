import { Block } from '@aws-sdk/client-textract';

export function extractDocumentText(blocks: Block[]): string {
  return blocks
    .filter((b) => b.BlockType === 'LINE' && b.Text)
    .map((b) => b.Text!)
    .join('\n');
}
