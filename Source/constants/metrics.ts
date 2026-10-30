// Must match local.app_metrics_namespace in Terraform/ai.tf — the svc role may
// only publish to this namespace.
export const APP_METRICS_NAMESPACE = 'DocAnalysis/AI';

export const METRICS_FLUSH_INTERVAL_MS = 60_000;

// PutMetricData accepts up to 1000 metric data entries per request
export const METRICS_MAX_PER_REQUEST = 1000;
