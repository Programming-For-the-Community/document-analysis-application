// Builds the installer and publishes it to the private release bucket.
//
//   npm run release -- [--platform win|mac] [--notes "What changed"] [--skip-build] [--dry-run] [--if-new]
//
// --if-new exits successfully (publishing nothing) when this version is already
// live — CI runs the release on every push to main, and only a version bump
// should produce a new installer.
//
// Workflow:
//   1. `npm version patch|minor|major`   bumps package.json and .env together
//   2. `npm run release -- --notes "…"`  builds, uploads, and points latest.json at it
//
// Guarantees:
//   - refuses to publish a version that isn't newer than the one already live
//   - refuses to overwrite a version that was already published (releases are immutable)
//   - .env APP_VERSION, package.json and the published latest.json all carry the
//     same version — verified by reading latest.json back after upload
//
// Uses the default AWS credential chain — your AWS CLI profile locally, the OIDC
// deploy role in CI (.github/workflows/app_release.yml) — which needs the
// doc-analysis-release-publisher policy from Terraform/releases.tf (or broader).
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');
const {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
} = require('@aws-sdk/client-s3');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

const { readEnv, syncEnvVersion } = require('./sync-version');

const ROOT = path.join(__dirname, '..');

// Must match RELEASE_PLATFORM_DIRS in constants/updater.ts
const PLATFORM_DIRS = { win32: 'win', darwin: 'mac' };
const BUILD_SCRIPTS = { win: 'dist:win', mac: 'dist:mac' };
const INSTALLER_EXT = { win: 'exe', mac: 'dmg' };

function parseArgs(argv) {
  const args = {
    platform: PLATFORM_DIRS[process.platform],
    notes: undefined,
    skipBuild: false,
    dryRun: false,
    ifNew: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--platform') args.platform = argv[++i];
    else if (arg === '--notes') args.notes = argv[++i];
    else if (arg === '--skip-build') args.skipBuild = true;
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--if-new') args.ifNew = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!BUILD_SCRIPTS[args.platform]) {
    throw new Error(`--platform must be one of: ${Object.keys(BUILD_SCRIPTS).join(', ')}`);
  }
  return args;
}

// Same ordering as utils/version.ts compareVersions
function compareVersions(a, b) {
  const [aCore, aPre] = a.split('-', 2);
  const [bCore, bPre] = b.split('-', 2);
  const aParts = aCore.split('.').map(Number);
  const bParts = bCore.split('.').map(Number);
  for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
    const diff = (aParts[i] ?? 0) - (bParts[i] ?? 0);
    if (diff !== 0) return diff;
  }
  if (aPre && !bPre) return -1;
  if (!aPre && bPre) return 1;
  return (aPre ?? '').localeCompare(bPre ?? '');
}

async function getJson(s3, bucket, key) {
  try {
    const result = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    return JSON.parse(await result.Body.transformToString());
  } catch (err) {
    if (err.name === 'NoSuchKey') return null;
    throw err;
  }
}

async function exists(s3, bucket, key) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (err) {
    if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) return false;
    throw err;
  }
}

function sha512File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha512');
    fs.createReadStream(filePath)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => resolve(hash.digest('base64')))
      .on('error', reject);
  });
}

async function resolveBucket(region, secretName) {
  if (process.env.RELEASE_BUCKET) return process.env.RELEASE_BUCKET;
  const sm = new SecretsManagerClient({ region });
  const result = await sm.send(new GetSecretValueCommand({ SecretId: secretName }));
  const bucket = JSON.parse(result.SecretString ?? '{}').RELEASE_BUCKET;
  if (!bucket) {
    throw new Error(
      `RELEASE_BUCKET missing from secret "${secretName}" — run terraform apply first`
    );
  }
  return bucket;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { version, build } = require('../package.json');

  if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`package.json version "${version}" is not a valid semver`);
  }

  const env = readEnv();
  const region = env.AWS_REGION || 'us-east-2';
  const secretName = env.AWS_SECRET_NAME || 'doc-analysis-secret';
  const bucket = await resolveBucket(region, secretName);
  const s3 = new S3Client({ region });
  const dir = args.platform;

  // The bucket name comes from Secrets Manager, so it stays out of the (CI) log
  console.log(`Releasing ${build.productName} ${version} (${dir}) to the release bucket`);

  const latest = await getJson(s3, bucket, `${dir}/latest.json`);
  const notNewer = latest && compareVersions(version, latest.version) <= 0;
  const alreadyPublished = await exists(s3, bucket, `${dir}/${version}/manifest.json`);
  if ((notNewer || alreadyPublished) && args.ifNew) {
    console.log(
      `Nothing to release: ${version} is not newer than the published ${latest?.version ?? version}`
    );
    return;
  }
  if (notNewer) {
    throw new Error(
      `Version ${version} is not newer than the published ${latest.version}. ` +
        'Bump it first with `npm version patch|minor|major`.'
    );
  }
  if (alreadyPublished) {
    throw new Error(`Version ${version} was already published for ${dir} — releases are immutable`);
  }

  if (syncEnvVersion(version)) console.log(`.env APP_VERSION updated to ${version}`);

  if (!args.skipBuild) {
    // Fixed command from a lookup table — no user input reaches the shell. npm is
    // resolved from PATH deliberately: this runs on a developer machine or a CI
    // runner, both of which supply their own npm. --publish never stops
    // electron-builder from attempting its own (GitHub) publishing on CI.
    // eslint-disable-next-line sonarjs/os-command
    execSync(`npm run ${BUILD_SCRIPTS[dir]} -- --publish never`, { cwd: ROOT, stdio: 'inherit' });
  }

  const installerName = `DocumentAnalysis-Setup-${version}.${INSTALLER_EXT[dir]}`;
  const installerPath = path.join(ROOT, build.directories.output, installerName);
  if (!fs.existsSync(installerPath)) {
    throw new Error(`Installer not found at ${installerPath} — did the build succeed?`);
  }

  const { size } = fs.statSync(installerPath);
  const manifest = {
    version,
    key: `${dir}/${version}/${installerName}`,
    sha512: await sha512File(installerPath),
    size,
    releaseDate: new Date().toISOString(),
    ...(args.notes ? { notes: args.notes } : {}),
  };

  if (args.dryRun) {
    console.log('Dry run — would publish:\n', JSON.stringify(manifest, null, 2));
    return;
  }

  console.log(`Uploading ${installerName} (${(size / 1024 / 1024).toFixed(1)} MB)…`);
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: manifest.key,
      Body: fs.createReadStream(installerPath),
      ContentLength: size,
      ContentType: 'application/octet-stream',
      Metadata: { version },
    })
  );

  const manifestBody = JSON.stringify(manifest, null, 2);
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: `${dir}/${version}/manifest.json`,
      Body: manifestBody,
      ContentType: 'application/json',
    })
  );

  // Written last: clients only see the release once the installer is fully uploaded
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: `${dir}/latest.json`,
      Body: manifestBody,
      ContentType: 'application/json',
      CacheControl: 'no-cache',
    })
  );

  const published = await getJson(s3, bucket, `${dir}/latest.json`);
  const envVersion = readEnv().APP_VERSION;
  if (published?.version !== version || envVersion !== version) {
    throw new Error(
      `Version mismatch after publish — package.json ${version}, .env ${envVersion}, ` +
        `latest.json ${published?.version}`
    );
  }

  console.log(`Published ${version}: package.json, .env and latest.json all report ${version}`);
}

main().catch((err) => {
  console.error(`Release failed: ${err.message}`);
  process.exit(1);
});
