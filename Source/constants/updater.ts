// Release bucket folder per platform — must match PLATFORM_DIRS in scripts/release.js
// Keyed by process.platform
export const RELEASE_PLATFORM_DIRS: Record<string, string | undefined> = {
  win32: 'win',
  darwin: 'mac',
  linux: 'linux',
};

// Once Windows installers are code-signed, set this to the certificate subject's
// CN (the publisher name shown by Windows). Downloaded installers are then refused
// unless Authenticode reports a valid signature from that publisher. Empty = only
// the SHA-512 check from the manifest is enforced.
export const REQUIRED_WIN_PUBLISHER = '';
