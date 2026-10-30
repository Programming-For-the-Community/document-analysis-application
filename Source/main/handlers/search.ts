import { ipcMain } from 'electron';

import { AWS_BEDROCK } from '../../classes/aws/bedrock';
import { AWS_CLOUDWATCH } from '../../classes/aws/cloudwatch';
import { Qdrant } from '../../classes/qdrant';
import { AppConfig } from '../../interfaces/config';
import { CognitoAuthResult } from '../../types/aws';
import { Logger } from '../../utils/logger';

export function registerSearchHandlers(
  getAppConfig: () => AppConfig | null,
  getTokens: () => CognitoAuthResult | null
): void {
  ipcMain.handle(
    'search:query',
    async (
      _event,
      projectId: string,
      query: string
    ): Promise<{
      success: boolean;
      answer?: string;
      citations?: Array<{ documentName: string; excerpt: string; score: number }>;
      error?: string;
    }> => {
      const config = getAppConfig();
      const tokens = getTokens();

      if (!config || !tokens || typeof tokens === 'boolean') {
        return { success: false, error: 'App not ready' };
      }

      if (!Qdrant.isAvailable()) {
        return { success: false, error: 'Search is not available — Qdrant is offline' };
      }

      const trimmedQuery = query.trim();
      if (!trimmedQuery) {
        return { success: false, error: 'Query is empty' };
      }

      const dims = { ModelId: config.bedrock.modelId };
      const started = Date.now();

      try {
        Logger.info(`search:query project=${projectId} query="${trimmedQuery.slice(0, 80)}…"`);

        const queryVector = await AWS_BEDROCK.embedText(trimmedQuery);
        const hits = await Qdrant.search(projectId, queryVector, 5);

        AWS_CLOUDWATCH.record('SearchQueries', 1, dims);
        AWS_CLOUDWATCH.record('SearchZeroHits', hits.length === 0 ? 1 : 0, dims);

        if (hits.length === 0) {
          return {
            success: true,
            answer: 'No relevant document passages were found for this question.',
            citations: [],
          };
        }

        // Build context for synthesis
        const context = hits
          .map((h, i) => `[${i + 1}] Source: "${h.documentName}"\n${h.text}`)
          .join('\n\n');

        const synthesisPrompt =
          `Answer the user's question based only on the following document excerpts. ` +
          `Cite source documents by name. If the excerpts don't contain enough information, say so.\n\n` +
          `Excerpts:\n${context}\n\n` +
          `Question: ${trimmedQuery}`;

        const answer = await AWS_BEDROCK.synthesize(synthesisPrompt);
        AWS_CLOUDWATCH.record('SearchEmptyAnswer', answer.trim() ? 0 : 1, dims);
        AWS_CLOUDWATCH.record('SearchLatency', Date.now() - started, dims, 'Milliseconds');

        const citations = hits.map((h) => ({
          documentId: h.documentId,
          documentName: h.documentName,
          excerpt: h.text.length > 300 ? `${h.text.slice(0, 300)}…` : h.text,
          score: h.score,
        }));

        Logger.info(`search:query: returned ${hits.length} citation(s)`);
        return { success: true, answer, citations };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Search failed';
        Logger.error(`search:query error: ${message}`);
        return { success: false, error: message };
      }
    }
  );
}
