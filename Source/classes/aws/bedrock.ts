import {
  BedrockRuntimeClient,
  ConverseCommand,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { Block } from '@aws-sdk/client-textract';

import { AWS_STS } from './sts';
import { AWS_CLOUDWATCH } from './cloudwatch';
import { Logger } from '../../utils/logger';
import { awsConfig } from '../../main/config';
import { parseBedrockJson } from '../../utils/bedrockJson';
import { extractDocumentText } from '../../utils/textract';
import { RelationshipGraph } from '../../interfaces/bedrock';
import { BEDROCK_SYSTEM_PROMPT, EMBED_MODEL_ID } from '../../constants/bedrock';
import { GraphExtractionError } from '../graphExtractionError';

export class AWS_BEDROCK {
  private static client: BedrockRuntimeClient;
  private static modelId: string;

  public static init(modelId: string): void {
    this.modelId = modelId;
    this.client = new BedrockRuntimeClient({
      region: awsConfig.region,
      credentials: async () => {
        await AWS_STS.maybeRefresh();
        return {
          accessKeyId: AWS_STS.credentials.accessKeyId,
          secretAccessKey: AWS_STS.credentials.secretAccessKey,
          sessionToken: AWS_STS.credentials.sessionToken,
        };
      },
    });
    Logger.debug(`Bedrock client initialized (model: ${modelId})`);
  }

  public static async embedText(text: string): Promise<number[]> {
    const body = JSON.stringify({ inputText: text });
    const response = await this.client.send(
      new InvokeModelCommand({
        modelId: EMBED_MODEL_ID,
        body: new TextEncoder().encode(body),
        contentType: 'application/json',
        accept: 'application/json',
      })
    );
    const parsed = JSON.parse(new TextDecoder().decode(response.body)) as {
      embedding: number[];
    };
    return parsed.embedding;
  }

  public static async synthesize(prompt: string): Promise<string> {
    const result = await this.client.send(
      new ConverseCommand({
        modelId: this.modelId,
        messages: [{ role: 'user', content: [{ text: prompt }] }],
        inferenceConfig: { maxTokens: 64000, temperature: 0.3 },
      })
    );
    return result.output?.message?.content?.find((c) => c.text !== undefined)?.text ?? '';
  }

  public static async extractRelationships(
    blocks: Block[],
    documentId: string,
    projectId: string
  ): Promise<RelationshipGraph> {
    return this.infer(extractDocumentText(blocks), documentId, projectId);
  }

  public static async extractRelationshipsFromText(
    text: string,
    documentId: string,
    projectId: string
  ): Promise<RelationshipGraph> {
    return this.infer(text, documentId, projectId);
  }

  private static async infer(
    text: string,
    documentId: string,
    projectId: string
  ): Promise<RelationshipGraph> {
    const dims = { ModelId: this.modelId };
    const started = Date.now();
    const result = await this.client.send(
      new ConverseCommand({
        modelId: this.modelId,
        system: [{ text: BEDROCK_SYSTEM_PROMPT }],
        messages: [
          {
            role: 'user',
            content: [{ text: `Document text:\n---\n${text}\n---` }],
          },
        ],
        inferenceConfig: { maxTokens: 9999, temperature: 0 },
      })
    );

    Logger.info(
      `Bedrock: response for document ${documentId} finished with stopReason: ${result.stopReason}`
    );

    const truncated = result.stopReason === 'max_tokens';
    if (truncated) {
      Logger.warn(
        `Bedrock: response for document ${documentId} was truncated (stopReason: max_tokens) — ` +
          `the document likely produced more entities/relationships than fit in the response.`
      );
    }

    const rawText =
      result.output?.message?.content?.find((c) => c.text !== undefined)?.text ?? '{}';

    const parsed = parseBedrockJson(rawText, documentId);

    // Every counter is recorded as 0 or 1 so the hourly rate alarms in
    // Terraform/monitoring.tf always have a numerator and denominator.
    AWS_CLOUDWATCH.record('ExtractionAttempts', 1, dims);
    AWS_CLOUDWATCH.record('ExtractionLatency', Date.now() - started, dims, 'Milliseconds');
    AWS_CLOUDWATCH.record('ExtractionTruncated', truncated ? 1 : 0, dims);
    AWS_CLOUDWATCH.record('ExtractionFailed', parsed ? 0 : 1, dims);
    AWS_CLOUDWATCH.record(
      'ExtractionRepaired',
      parsed && parsed.strategy !== 'clean' ? 1 : 0,
      dims
    );

    if (!parsed) throw new GraphExtractionError(documentId);
    const extracted = parsed.payload;

    const graph: RelationshipGraph = {
      documentId,
      projectId,
      entities: extracted.entities ?? [],
      relationships: extracted.relationships ?? [],
    };

    AWS_CLOUDWATCH.record('ExtractionZeroEntities', graph.entities.length === 0 ? 1 : 0, dims);
    AWS_CLOUDWATCH.record('EntitiesPerDocument', graph.entities.length, dims);
    AWS_CLOUDWATCH.record('RelationshipsPerDocument', graph.relationships.length, dims);

    Logger.info(
      `Bedrock extracted ${graph.entities.length} entity/entities and ${graph.relationships.length} relationship(s) for document ${documentId}`
    );

    return graph;
  }
}
