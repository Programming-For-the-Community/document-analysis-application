// Keeps APP_VERSION in .env identical to package.json's version — package.json is
// the single source of truth (electron-builder and app.getVersion() both read it).
//
//   node scripts/sync-version.js           rewrite .env if it differs
//   node scripts/sync-version.js --check   exit 1 if it differs (used by `npm run check`)
//
// Also runs automatically from the npm "version" lifecycle hook, so
// `npm version patch|minor|major` bumps both files in the same commit.
const fs = require('node:fs');
const path = require('node:path');

const ENV_PATH = path.join(__dirname, '..', '.env');

function readEnv() {
  const values = {};
  if (!fs.existsSync(ENV_PATH)) return values;
  for (const line of fs.readFileSync(ENV_PATH, 'utf8').split(/\r?\n/)) {
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (/^[A-Z0-9_]+$/.test(key)) values[key] = line.slice(eq + 1).trim();
  }
  return values;
}

function syncEnvVersion(version) {
  const current = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf8') : '';
  const next = /^APP_VERSION=.*$/m.test(current)
    ? current.replace(/^APP_VERSION=.*$/m, `APP_VERSION=${version}`)
    : `${current.trimEnd()}\nAPP_VERSION=${version}\n`;
  if (next === current) return false;
  fs.writeFileSync(ENV_PATH, next);
  return true;
}

// CLI entry point, split out so it can be unit-tested. Returns the exit code.
function run(argv, version) {
  if (argv.includes('--check')) {
    const envVersion = readEnv().APP_VERSION;
    if (envVersion !== version) {
      console.error(
        `.env APP_VERSION (${envVersion ?? 'missing'}) does not match package.json (${version}). ` +
          'Run `node scripts/sync-version.js`.'
      );
      return 1;
    }
    console.log(`.env APP_VERSION matches package.json (${version})`);
    return 0;
  }

  const changed = syncEnvVersion(version);
  console.log(
    changed ? `.env APP_VERSION set to ${version}` : `.env APP_VERSION already ${version}`
  );
  return 0;
}

module.exports = { readEnv, syncEnvVersion, run, ENV_PATH };

// Run directly (not require()d) — compared by filename, which Sonar's typings
// can follow, unlike `require.main === module`
if (require.main?.filename === __filename) {
  process.exitCode = run(process.argv.slice(2), require('../package.json').version);
}
