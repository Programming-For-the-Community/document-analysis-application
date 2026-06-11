export class GraphExtractionError extends Error {
  constructor(documentId: string) {
    super(`Graph extraction failed for document ${documentId} — Bedrock returned unparseable JSON`);
    this.name = 'GraphExtractionError';
  }
}
