import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import {
  BedrockRuntimeClient,
  ConverseCommand,
  ConverseCommandOutput,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';

import { AWS_BEDROCK } from '../../../classes/aws/bedrock';
import { AWS_CLOUDWATCH } from '../../../classes/aws/cloudwatch';
import { GraphExtractionError } from '../../../classes/graphExtractionError';
import { EMBED_MODEL_ID } from '../../../constants/bedrock';
import { clientOf, resolveClientCredentials, stubStsCredentials } from '../../helpers';

const bedrock = mockClient(BedrockRuntimeClient);

function reply(text: string | undefined, stopReason = 'end_turn'): Partial<ConverseCommandOutput> {
  return {
    stopReason: stopReason as ConverseCommandOutput['stopReason'],
    output: { message: { role: 'assistant', content: text === undefined ? [] : [{ text }] } },
  };
}

const GRAPH_JSON = JSON.stringify({
  entities: [
    { id: 'e1', type: 'Person', value: 'Jane' },
    { id: 'e2', type: 'Organization', value: 'Acme' },
  ],
  relationships: [{ source: 'e1', target: 'e2', type: 'EMPLOYED_BY' }],
});

// Metric name → value recorded for it on the last extraction
function recordedMetrics(record: ReturnType<typeof vi.spyOn>): Record<string, number> {
  return Object.fromEntries(record.mock.calls.map(([name, value]) => [name, value]));
}

describe('AWS_BEDROCK', () => {
  let record: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    bedrock.reset();
    stubStsCredentials();
    record = vi.spyOn(AWS_CLOUDWATCH, 'record').mockImplementation(() => undefined);
    AWS_BEDROCK.init('us.amazon.nova-lite-v1:0');
  });

  it('sources credentials from the assumed role', async () => {
    await expect(resolveClientCredentials(clientOf(AWS_BEDROCK))).resolves.toMatchObject({
      accessKeyId: 'AKIA',
    });
  });

  it('embeds text with Titan', async () => {
    bedrock.on(InvokeModelCommand).resolves({
      body: new TextEncoder().encode(JSON.stringify({ embedding: [0.1, 0.2] })),
    } as never);

    await expect(AWS_BEDROCK.embedText('hello')).resolves.toEqual([0.1, 0.2]);

    const input = bedrock.commandCalls(InvokeModelCommand)[0]!.args[0].input;
    expect(input.modelId).toBe(EMBED_MODEL_ID);
    expect(JSON.parse(new TextDecoder().decode(input.body as Uint8Array))).toEqual({
      inputText: 'hello',
    });
  });

  it('synthesizes an answer, returning empty text when there is none', async () => {
    bedrock.on(ConverseCommand).resolvesOnce(reply('The answer')).resolvesOnce(reply(undefined));

    await expect(AWS_BEDROCK.synthesize('q')).resolves.toBe('The answer');
    await expect(AWS_BEDROCK.synthesize('q')).resolves.toBe('');
  });

  it('extracts a graph from Textract blocks and records clean-run metrics', async () => {
    bedrock.on(ConverseCommand).resolves(reply(GRAPH_JSON));

    const graph = await AWS_BEDROCK.extractRelationships(
      [
        { BlockType: 'LINE', Text: 'Jane works at Acme' },
        { BlockType: 'WORD', Text: 'x' },
      ],
      'doc',
      'proj'
    );

    expect(graph).toMatchObject({ documentId: 'doc', projectId: 'proj' });
    expect(graph.entities).toHaveLength(2);
    expect(graph.relationships).toHaveLength(1);

    const input = bedrock.commandCalls(ConverseCommand)[0]!.args[0].input;
    expect(input.messages![0]!.content![0]!.text).toContain('Jane works at Acme');
    expect(input.inferenceConfig).toMatchObject({ temperature: 0 });

    expect(recordedMetrics(record)).toMatchObject({
      ExtractionAttempts: 1,
      ExtractionTruncated: 0,
      ExtractionFailed: 0,
      ExtractionRepaired: 0,
      ExtractionZeroEntities: 0,
      EntitiesPerDocument: 2,
      RelationshipsPerDocument: 1,
    });
    expect(record).toHaveBeenCalledWith(
      'ExtractionLatency',
      expect.any(Number),
      { ModelId: 'us.amazon.nova-lite-v1:0' },
      'Milliseconds'
    );
  });

  it('flags truncated, repaired and empty extractions', async () => {
    // Trailing comma needs jsonrepair; no entities/relationships keys at all
    bedrock.on(ConverseCommand).resolves(reply('{"entities": [],}', 'max_tokens'));

    const graph = await AWS_BEDROCK.extractRelationshipsFromText('text', 'doc', 'proj');

    expect(graph.entities).toEqual([]);
    expect(graph.relationships).toEqual([]);
    expect(recordedMetrics(record)).toMatchObject({
      ExtractionTruncated: 1,
      ExtractionRepaired: 1,
      ExtractionZeroEntities: 1,
    });
  });

  it('defaults to an empty graph when the reply has no text', async () => {
    bedrock.on(ConverseCommand).resolves(reply(undefined));
    const graph = await AWS_BEDROCK.extractRelationshipsFromText('text', 'doc', 'proj');
    expect(graph.entities).toEqual([]);
  });

  it('throws GraphExtractionError for unparseable output and records the failure', async () => {
    bedrock.on(ConverseCommand).resolves(reply('I cannot help with that.'));

    await expect(
      AWS_BEDROCK.extractRelationshipsFromText('text', 'doc', 'proj')
    ).rejects.toBeInstanceOf(GraphExtractionError);
    expect(recordedMetrics(record)).toMatchObject({ ExtractionFailed: 1, ExtractionRepaired: 0 });
    expect(record).not.toHaveBeenCalledWith(
      'EntitiesPerDocument',
      expect.anything(),
      expect.anything()
    );
  });
});
