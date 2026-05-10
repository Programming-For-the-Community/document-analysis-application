import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
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

const PROMPT_TEMPLATE = `You are extracting structured information from a business document. The text below was extracted via OCR using AWS Textract.

Document text:
---
{TEXT}
---

Extract all entities and relationships present in this document. Return ONLY a valid JSON object — no explanation, no markdown fences — with exactly this structure:
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

  public static async extractRelationships(
    blocks: Block[],
    documentId: string,
    projectId: string
  ): Promise<RelationshipGraph> {
    const text = extractDocumentText(blocks);
    const prompt = PROMPT_TEMPLATE.replace('{TEXT}', text);

    const requestBody = JSON.stringify({
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    });

    const result = await this.client.send(
      new InvokeModelCommand({
        modelId: this.modelId,
        body: requestBody,
        contentType: 'application/json',
        accept: 'application/json',
      })
    );

    const responseText = new TextDecoder().decode(result.body);
    const response = JSON.parse(responseText) as {
      content: Array<{ type: string; text: string }>;
    };

    const rawJson = response.content.find((c) => c.type === 'text')?.text ?? '{}';
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
