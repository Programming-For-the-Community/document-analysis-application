import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';

import { AWS_CLOUDWATCH } from '../../../classes/aws/cloudwatch';
import { Logger } from '../../../utils/logger';
import { APP_METRICS_NAMESPACE, METRICS_FLUSH_INTERVAL_MS } from '../../../constants/metrics';
import { clientOf, resolveClientCredentials, stubStsCredentials } from '../../helpers';

const cw = mockClient(CloudWatchClient);
const internals = AWS_CLOUDWATCH as unknown as {
  client: CloudWatchClient | null;
  buffer: Map<string, unknown>;
};

describe('AWS_CLOUDWATCH', () => {
  beforeEach(() => {
    cw.reset();
    cw.on(PutMetricDataCommand).resolves({});
    stubStsCredentials();
  });

  afterEach(async () => {
    await AWS_CLOUDWATCH.shutdown();
    internals.client = null;
    internals.buffer.clear();
    vi.useRealTimers();
  });

  it('drops metrics before init', async () => {
    AWS_CLOUDWATCH.record('ExtractionAttempts', 1, { ModelId: 'm' });
    await AWS_CLOUDWATCH.flush();
    expect(cw.commandCalls(PutMetricDataCommand)).toHaveLength(0);
  });

  it('sources credentials from the assumed role', async () => {
    AWS_CLOUDWATCH.init();
    await expect(resolveClientCredentials(clientOf(AWS_CLOUDWATCH))).resolves.toMatchObject({
      accessKeyId: 'AKIA',
    });
  });

  it('aggregates samples per metric and dimension set into statistic sets', async () => {
    AWS_CLOUDWATCH.init();
    AWS_CLOUDWATCH.record('Latency', 10, { ModelId: 'm' }, 'Milliseconds');
    AWS_CLOUDWATCH.record('Latency', 30, { ModelId: 'm' }, 'Milliseconds');
    AWS_CLOUDWATCH.record('Latency', 5, { ModelId: 'other' }, 'Milliseconds');

    await AWS_CLOUDWATCH.flush();

    const input = cw.commandCalls(PutMetricDataCommand)[0]!.args[0].input;
    expect(input.Namespace).toBe(APP_METRICS_NAMESPACE);
    expect(input.MetricData).toHaveLength(2);
    expect(input.MetricData![0]).toMatchObject({
      MetricName: 'Latency',
      Unit: 'Milliseconds',
      Dimensions: [{ Name: 'ModelId', Value: 'm' }],
      StatisticValues: { SampleCount: 2, Sum: 40, Minimum: 10, Maximum: 30 },
    });

    // The buffer is emptied, so a second flush sends nothing
    await AWS_CLOUDWATCH.flush();
    expect(cw.commandCalls(PutMetricDataCommand)).toHaveLength(1);
  });

  it('splits large flushes into 1000-datum requests', async () => {
    AWS_CLOUDWATCH.init();
    for (let i = 0; i < 1001; i++) AWS_CLOUDWATCH.record('M', 1, { Index: String(i) });

    await AWS_CLOUDWATCH.flush();

    const sizes = cw
      .commandCalls(PutMetricDataCommand)
      .map((c) => c.args[0].input.MetricData!.length);
    expect(sizes).toEqual([1000, 1]);
  });

  it('logs and drops the batch when publishing fails', async () => {
    cw.on(PutMetricDataCommand).rejects(new Error('throttled'));
    AWS_CLOUDWATCH.init();
    AWS_CLOUDWATCH.record('M', 1, {});

    await expect(AWS_CLOUDWATCH.flush()).resolves.toBeUndefined();
    expect(Logger.warn).toHaveBeenCalledWith(expect.stringContaining('throttled'));
  });

  it('flushes on its interval and on shutdown', async () => {
    vi.useFakeTimers();
    AWS_CLOUDWATCH.init();
    AWS_CLOUDWATCH.record('M', 1, {});

    await vi.advanceTimersByTimeAsync(METRICS_FLUSH_INTERVAL_MS);
    expect(cw.commandCalls(PutMetricDataCommand)).toHaveLength(1);

    AWS_CLOUDWATCH.record('M', 1, {});
    await AWS_CLOUDWATCH.shutdown();
    expect(cw.commandCalls(PutMetricDataCommand)).toHaveLength(2);
  });
});
