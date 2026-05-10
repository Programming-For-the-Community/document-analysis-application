import { BedrockRuntimeClient, ConverseCommand, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { Block } from '@aws-sdk/client-textract';

import { AWS_STS } from './sts';
import { awsConfig } from '../main/config';
import { Logger } from '../utils/logger';

export interface Entity {
  id: string;
  type:
    | 'Person' | 'Organization' | 'Date' | 'Amount' | 'Location' | 'Product'
    | 'Role' | 'Account' | 'Event' | 'Technology' | 'Concept' | 'Regulation'
    | 'Agreement' | 'Asset' | 'Task';
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

const SYSTEM_PROMPT = `You are an information extraction engine. Given text from any document type — including invoices, contracts, emails, reports, spreadsheets, and web pages — extract all significant named entities and the relationships between them. Return ONLY a valid JSON object with no explanation and no markdown fences, using exactly this structure:
{
  "entities": [
    { "id": "e1", "type": "Person", "value": "John Smith" }
  ],
  "relationships": [
    { "source": "e1", "target": "e2", "type": "EMPLOYED_BY", "attributes": { "title": "Engineer" } }
  ]
}

Entity types (use the best fit):
Person, Organization, Date, Amount, Location, Product, Role, Account, Event, Technology, Concept, Regulation, Agreement, Asset, Task

Relationship types (use the best fit; use RELATED_TO if nothing else fits):
EMPLOYED_BY, MANAGES, PAID_BY, SHIPS_TO, SHIPS_FROM, ORDERED_FROM, INVOICED_BY, INVOICED_TO, REFERENCES, DATED, LOCATED_AT, HAS_ROLE, AUTHORED_BY, OWNS, PART_OF, CONTRACTED_WITH, RESPONSIBLE_FOR, SIGNED_BY, REPORTED_TO, SUBSIDIARY_OF, REQUIRES, RELATED_TO

Rules:
- Assign the same entity id to the same real-world entity even if it appears under different names or abbreviations. Prefer the most complete form of the name as the value.
- Omit generic noun phrases that are not specific named entities (e.g. "the company", "the product").
- Extract all significant entities and relationships, not just the most prominent ones.`;

function extractDocumentText(blocks: Block[]): string {
  return blocks
    .filter((b) => b.BlockType === 'LINE' && b.Text)
    .map((b) => b.Text!)
    .join('\n');
}

const EMBED_MODEL_ID = 'amazon.titan-embed-text-v2:0';

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
        inferenceConfig: { maxTokens: 8192, temperature: 0 },
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
