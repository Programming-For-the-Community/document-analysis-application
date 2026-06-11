export const PROCESSING_STATUS = {
  UNPROCESSED: 'UNPROCESSED',
  QUEUED: 'QUEUED',
  PROCESSING: 'PROCESSING',
  COMPLETE: 'COMPLETE',
  FAILED: 'FAILED',
  GRAPH_FAILED: 'GRAPH_FAILED'
} as const;

// Extensions whose original text can be re-embedded directly without Textract
export const TEXT_EXTENSIONS = new Set(['.txt', '.csv', '.md']);
