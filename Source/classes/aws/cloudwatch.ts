import {
  CloudWatchClient,
  PutMetricDataCommand,
  MetricDatum,
  StandardUnit,
} from '@aws-sdk/client-cloudwatch';

import { AWS_STS } from './sts';
import { Logger } from '../../utils/logger';
import { awsConfig } from '../../main/config';
import {
  APP_METRICS_NAMESPACE,
  METRICS_FLUSH_INTERVAL_MS,
  METRICS_MAX_PER_REQUEST,
} from '../../constants/metrics';

interface Aggregate {
  name: string;
  unit: StandardUnit;
  dimensions: Record<string, string>;
  count: number;
  sum: number;
  min: number;
  max: number;
}

// Buffers app-level AI quality metrics and publishes them as per-interval
// statistic sets, so a burst of extractions costs one PutMetricData call
// instead of one per document. Metrics are best-effort: failures are logged
// and dropped, never surfaced to the user.
export class AWS_CLOUDWATCH {
  private static client: CloudWatchClient | null = null;
  private static buffer = new Map<string, Aggregate>();
  private static timer: ReturnType<typeof setInterval> | null = null;

  public static init(): void {
    this.client = new CloudWatchClient({
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
    this.timer = setInterval(() => void this.flush(), METRICS_FLUSH_INTERVAL_MS);
    Logger.debug(`CloudWatch metrics client initialized (namespace: ${APP_METRICS_NAMESPACE})`);
  }

  public static record(
    name: string,
    value: number,
    dimensions: Record<string, string>,
    unit: StandardUnit = 'Count'
  ): void {
    if (!this.client) return;
    const key = `${name}|${JSON.stringify(dimensions)}`;
    const agg = this.buffer.get(key);
    if (agg) {
      agg.count += 1;
      agg.sum += value;
      agg.min = Math.min(agg.min, value);
      agg.max = Math.max(agg.max, value);
    } else {
      this.buffer.set(key, {
        name,
        unit,
        dimensions,
        count: 1,
        sum: value,
        min: value,
        max: value,
      });
    }
  }

  public static async flush(): Promise<void> {
    if (!this.client || this.buffer.size === 0) return;

    const timestamp = new Date();
    const data: MetricDatum[] = [...this.buffer.values()].map((agg) => ({
      MetricName: agg.name,
      Unit: agg.unit,
      Timestamp: timestamp,
      Dimensions: Object.entries(agg.dimensions).map(([Name, Value]) => ({ Name, Value })),
      StatisticValues: { SampleCount: agg.count, Sum: agg.sum, Minimum: agg.min, Maximum: agg.max },
    }));
    this.buffer.clear();

    for (let i = 0; i < data.length; i += METRICS_MAX_PER_REQUEST) {
      try {
        await this.client.send(
          new PutMetricDataCommand({
            Namespace: APP_METRICS_NAMESPACE,
            MetricData: data.slice(i, i + METRICS_MAX_PER_REQUEST),
          })
        );
      } catch (err) {
        Logger.warn(
          `CloudWatch metrics flush failed (dropped ${data.length} datum/data): ${err instanceof Error ? err.message : String(err)}`
        );
        return;
      }
    }
    Logger.debug(`CloudWatch: published ${data.length} metric aggregate(s)`);
  }

  public static async shutdown(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.flush();
  }
}
