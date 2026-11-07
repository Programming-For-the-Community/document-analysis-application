// Offline quality check for Bedrock relationship extraction (AI monitoring plan, Phase 4.1).
//
//   npm run eval:extraction                      run every case, compare to baseline
//   npm run eval:extraction -- --update-baseline accept the current scores as the new baseline
//   npm run eval:extraction -- --case invoice    run cases whose filename contains "invoice"
//
// Re-run whenever BEDROCK_SYSTEM_PROMPT, the model (BEDROCK_MODEL_ID) or inferenceConfig
// changes. Exits 1 if any aggregate score drops more than TOLERANCE below the baseline.
//
// Cases live in eval/extraction/cases/*.json:
//   { "name": "...", "text": "document text",
//     "expected": { "entities": [{ "type": "Person", "value": "Jane Doe" }],
//                   "relationships": [{ "source": "Jane Doe", "type": "EMPLOYED_BY", "target": "Acme Corp" }] } }
// Expected relationships reference entity values (not ids) so cases are easy to write by hand.
//
// Runs against the compiled app in dist/ — `npm run build` first. Uses your local AWS
// credentials the same way the app does (Secrets Manager → assume svc role).
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const EVAL_DIR = path.join(ROOT, 'eval', 'extraction');
const CASES_DIR = path.join(EVAL_DIR, 'cases');
const BASELINE_PATH = path.join(EVAL_DIR, 'baseline.json');
const REPORT_PATH = path.join(EVAL_DIR, 'last-report.json');
const TOLERANCE = 0.05;

const dist = (p) => require(path.join(ROOT, 'dist', p));

function parseArgs(argv) {
  const args = { updateBaseline: false, filter: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--update-baseline') args.updateBaseline = true;
    else if (argv[i] === '--case') args.filter = argv[++i];
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  return args;
}

function makeKeyers(normalizeEntityName) {
  const norm = (value, type) => normalizeEntityName(String(value), type).toLowerCase();
  return {
    entityKey: (e) => `${e.type}::${norm(e.value, e.type)}`,
    // Relationships are compared by endpoint values, ignoring entity types, so a
    // correct edge isn't penalised twice for a mistyped endpoint.
    relKey: (source, type, target) => `${norm(source, 'Other')}::${type}::${norm(target, 'Other')}`,
  };
}

function prf(expected, actual) {
  const tp = [...actual].filter((k) => expected.has(k)).length;
  // An empty prediction is perfect precision only when nothing was expected
  let precision = expected.size ? 0 : 1;
  if (actual.size) precision = tp / actual.size;
  const recall = expected.size ? tp / expected.size : 1;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  return { precision, recall, f1, tp, expected: expected.size, actual: actual.size };
}

const round = (n) => Math.round(n * 1000) / 1000;

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!fs.existsSync(path.join(ROOT, 'dist', 'classes', 'aws', 'bedrock.js'))) {
    throw new Error('dist/ not found — run `npm run build` first');
  }

  const { Logger } = dist('utils/logger.js');
  Logger.init({ level: 'warn' });
  const { AWS_SECRETS } = dist('classes/aws/secrets.js');
  const { AWS_STS } = dist('classes/aws/sts.js');
  const { AWS_BEDROCK } = dist('classes/aws/bedrock.js');
  const { GraphExtractionError } = dist('classes/graphExtractionError.js');
  const { normalizeEntityName } = dist('utils/entityNormalization.js');
  const { entityKey, relKey } = makeKeyers(normalizeEntityName);

  const files = fs
    .readdirSync(CASES_DIR)
    .filter((f) => f.endsWith('.json') && (!args.filter || f.includes(args.filter)))
    .sort((a, b) => a.localeCompare(b));
  if (files.length === 0) throw new Error(`No cases found in ${CASES_DIR}`);

  await AWS_SECRETS.init();
  await AWS_STS.init(AWS_SECRETS.secrets.SVC_ROLE_ARN);
  const modelId = AWS_SECRETS.secrets.BEDROCK_MODEL_ID;
  AWS_BEDROCK.init(modelId);

  console.log(`Evaluating ${files.length} case(s) against ${modelId}\n`);

  const results = [];
  for (const file of files) {
    const testCase = JSON.parse(fs.readFileSync(path.join(CASES_DIR, file), 'utf8'));
    const name = testCase.name ?? file;
    const started = Date.now();

    let graph = null;
    try {
      graph = await AWS_BEDROCK.extractRelationshipsFromText(testCase.text, `eval-${file}`, 'eval');
    } catch (err) {
      if (!(err instanceof GraphExtractionError)) throw err;
    }

    const expectedEntities = new Set(testCase.expected.entities.map(entityKey));
    const expectedRels = new Set(
      testCase.expected.relationships.map((r) => relKey(r.source, r.type, r.target))
    );

    let entities = { precision: 0, recall: 0, f1: 0 };
    let relationships = { precision: 0, recall: 0, f1: 0 };
    if (graph) {
      const valueById = new Map(graph.entities.map((e) => [e.id, e.value]));
      const actualEntities = new Set(graph.entities.map(entityKey));
      const actualRels = new Set(
        graph.relationships
          .filter((r) => valueById.has(r.source) && valueById.has(r.target))
          .map((r) => relKey(valueById.get(r.source), r.type, valueById.get(r.target)))
      );
      entities = prf(expectedEntities, actualEntities);
      relationships = prf(expectedRels, actualRels);
    }

    const result = {
      name,
      file,
      parsed: !!graph,
      ms: Date.now() - started,
      entities,
      relationships,
    };
    results.push(result);
    console.log(
      `${graph ? '✓' : '✗'} ${name.padEnd(40)} entities F1 ${round(entities.f1).toFixed(3)}  ` +
        `relationships F1 ${round(relationships.f1).toFixed(3)}  (${result.ms}ms)`
    );
  }

  const mean = (pick) => round(results.reduce((sum, r) => sum + pick(r), 0) / results.length);
  const summary = {
    modelId,
    cases: results.length,
    parseRate: mean((r) => (r.parsed ? 1 : 0)),
    entityPrecision: mean((r) => r.entities.precision),
    entityRecall: mean((r) => r.entities.recall),
    entityF1: mean((r) => r.entities.f1),
    relationshipPrecision: mean((r) => r.relationships.precision),
    relationshipRecall: mean((r) => r.relationships.recall),
    relationshipF1: mean((r) => r.relationships.f1),
  };

  fs.writeFileSync(
    REPORT_PATH,
    JSON.stringify({ ranAt: new Date().toISOString(), summary, results }, null, 2)
  );
  console.log('\nSummary:', summary);
  console.log(`Full report: ${path.relative(ROOT, REPORT_PATH)}`);

  if (args.updateBaseline) {
    fs.writeFileSync(BASELINE_PATH, JSON.stringify(summary, null, 2) + '\n');
    console.log(`Baseline updated: ${path.relative(ROOT, BASELINE_PATH)}`);
    return;
  }

  if (!fs.existsSync(BASELINE_PATH)) {
    console.log('No baseline yet — run with --update-baseline to record one.');
    return;
  }

  const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
  const regressions = Object.keys(summary)
    .filter(
      (k) => typeof summary[k] === 'number' && k !== 'cases' && typeof baseline[k] === 'number'
    )
    .filter((k) => summary[k] < baseline[k] - TOLERANCE)
    .map((k) => `${k}: ${baseline[k]} → ${summary[k]}`);

  if (regressions.length > 0) {
    console.error(
      `\nRegression vs baseline (tolerance ${TOLERANCE}):\n  ${regressions.join('\n  ')}`
    );
    process.exit(1);
  }
  console.log(`\nNo regressions vs baseline (tolerance ${TOLERANCE}).`);
}

main().catch((err) => {
  console.error(`Eval failed: ${err.message}`);
  process.exit(1);
});
