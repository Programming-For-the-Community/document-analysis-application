// Written to {platform}/latest.json in the release bucket by scripts/release.js
export interface ReleaseManifest {
  version: string;
  key: string; // S3 key of the installer, e.g. win/1.2.0/DocumentAnalysis-Setup-1.2.0.exe
  sha512: string; // base64
  size: number;
  releaseDate: string;
  notes?: string;
}

export type UpdateState =
  | { status: 'idle' }
  | { status: 'available'; version: string; notes?: string }
  | { status: 'downloading'; version: string; percent: number }
  | { status: 'installing'; version: string }
  | { status: 'error'; version?: string; message: string };
