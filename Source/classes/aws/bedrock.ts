import {
  BedrockRuntimeClient,
  ConverseCommand,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { Block } from '@aws-sdk/client-textract';

import { AWS_STS } from './sts';
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

    Logger.info(`Bedrock: response for document ${documentId} finished with stopReason: ${result.stopReason}`);

    if (result.stopReason === 'max_tokens') {
      Logger.warn(
        `Bedrock: response for document ${documentId} was truncated (stopReason: max_tokens) — ` +
          `the document likely produced more entities/relationships than fit in the response.`
      );
    }

    const rawText =
      result.output?.message?.content?.find((c) => c.text !== undefined)?.text ?? '{}';

    const extracted = parseBedrockJson(rawText, documentId);
    if (!extracted) throw new GraphExtractionError(documentId);

    const graph: RelationshipGraph = {
      documentId,
      projectId,
      entities: extracted.entities ?? [],
      relationships: extracted.relationships ?? [],
    };

    Logger.info(
      `Bedrock extracted ${graph.entities.length} entity/entities and ${graph.relationships.length} relationship(s) for document ${documentId}`
    );

    return graph;
  }
}
