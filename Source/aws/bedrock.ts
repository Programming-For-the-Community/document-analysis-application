import { BedrockRuntimeClient, ConverseCommand, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { Block } from '@aws-sdk/client-textract';

import { AWS_STS } from './sts';
import { awsConfig } from '../main/config';
import { Logger } from '../utils/logger';

export interface Entity {
  id: string;
  type: 'Person' | 'Organization' | 'Date' | 'Amount' | 'Location' | 'Product' | 'Role' | 'Account';
  value: string;
}

export interface Relationship {
  source: string;
  target: string;
  type: string;
  attributes?: Record<string, string>;
}

export interface RelationshipGraph {
  documentId: string;
  projectId: string;
  entities: Entity[];
  relationships: Relationship[];
}

const SYSTEM_PROMPT = `You are an information extraction engine for business documents. Extract entities and relationships from OCR text and return them as a JSON object.

Return ONLY a valid JSON object with no explanation and no markdown fences, using exactly this structure:
{
  "entities": [
    { "id": "e1", "type": "Person", "value": "John Smith" }
  ],
  "relationships": [
    { "source": "e1", "target": "e2", "type": "EMPLOYED_BY", "attributes": { "title": "Engineer" } }
  ]
}

Entity types (use exactly): Person, Organization, Date, Amount, Location, Product, Role, Account
Relationship types (use exactly): EMPLOYED_BY, MANAGES, PAID_BY, SHIPS_TO, SHIPS_FROM, ORDERED_FROM, INVOICED_BY, INVOICED_TO, REFERENCES, DATED, LOCATED_AT, HAS_ROLE`;

function extractDocumentText(blocks: Block[]): string {
  return blocks
    .filter((b) => b.BlockType === 'LINE' && b.Text)
    .map((b) => b.Text!)
    .join('\n');
}

const EMBED_MODEL_ID = 'amazon.titan-embed-text-v2:0';

export type BedrockDocFormat = 'pdf' | 'csv' | 'doc' | 'docx' | 'xls' | 'xlsx' | 'html' | 'txt' | 'md';

export class AWS_BEDROCK {
  private static client: BedrockRuntimeClient;
  private static modelId: string;

  public static init(modelId: string): void {
    this.modelId = modelId;
    this.client = new BedrockRuntimeClient({
      region: awsConfig.region,
      credentials: () => Promise.resolve({
        accessKeyId: AWS_STS.credentials.accessKeyId,
        secretAccessKey: AWS_STS.credentials.secretAccessKey,
        sessionToken: AWS_STS.credentials.sessionToken,
      }),
    });
    Logger.debug(`Bedrock client initialized (model: ${modelId})`);
  }

  public static extractText(blocks: Block[]): string {
    return extractDocumentText(blocks);
  }

  public static async embedText(text: string): Promise<number[]> {
    const body = JSON.stringify({ inputText: text });
    const response = await this.client.send(
      new InvokeModelCommand({
        modelId:     EMBED_MODEL_ID,
        body:        new TextEncoder().encode(body),
        contentType: 'application/json',
        accept:      'application/json',
      })
    );
    const parsed = JSON.parse(new TextDecoder().decode(response.body)) as {
      embedding: number[];
    };
    return parsed.embedding;
  }

  public static async extractTextFromDocument(
    bytes: Uint8Array,
    format: BedrockDocFormat,
    documentName: string
  ): Promise<string> {
    const name = documentName
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-zA-Z0-9 _-]/g, '_')
      .slice(0, 100) || 'document';
    const result = await this.client.send(
      new ConverseCommand({
        modelId: this.modelId,
        messages: [{
          role: 'user',
          content: [
            { document: { format, name, source: { bytes } } },
            { text: 'Extract all text content from this document. Return only the plain text, preserving paragraphs and logical structure. Do not summarize, add commentary, or omit any text.' },
          ],
        }],
        inferenceConfig: { maxTokens: 8192, temperature: 0 },
      })
    );
    return result.output?.message?.content?.find((c) => c.text !== undefined)?.text ?? '';
  }

  public static async synthesize(prompt: string): Promise<string> {
    const result = await this.client.send(
      new ConverseCommand({
        modelId:  this.modelId,
        messages: [{ role: 'user', content: [{ text: prompt }] }],
        inferenceConfig: { maxTokens: 1024, temperature: 0.3 },
      })
    );
    return (
      result.output?.message?.content?.find((c) => c.text !== undefined)?.text ?? ''
    );
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
        system: [{ text: SYSTEM_PROMPT }],
        messages: [
          {
            role: 'user',
            content: [{ text: `Document text:\n---\n${text}\n---` }],
          },
        ],
        inferenceConfig: { maxTokens: 4096, temperature: 0 },
      })
    );

    const rawText =
      result.output?.message?.content?.find((c) => c.text !== undefined)?.text ?? '{}';

    // Strip markdown code fences that models sometimes include despite instructions
    const rawJson = rawText.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');

    const extracted = JSON.parse(rawJson) as {
      entities?: Entity[];
      relationships?: Relationship[];
    };

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
