import 'server-only';
import { AwsClient } from 'aws4fetch';

// Cloudflare R2 (S3-compatible) — server-only. Used for coin/brand logo uploads.
// Credentials come from .env (never committed). If unset, helpers throw a clear
// "not configured" error that routes surface gracefully.
const ENDPOINT = process.env.R2_ENDPOINT;
const BUCKET = process.env.R2_BUCKET_NAME;
const ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;

export function r2Configured(): boolean {
  return Boolean(ENDPOINT && BUCKET && ACCESS_KEY_ID && SECRET_ACCESS_KEY);
}

let _client: AwsClient | null = null;
function client(): AwsClient {
  if (!r2Configured()) {
    throw Object.assign(new Error('R2 storage is not configured on the server.'), { status: 503 });
  }
  if (!_client) {
    _client = new AwsClient({
      accessKeyId: ACCESS_KEY_ID!,
      secretAccessKey: SECRET_ACCESS_KEY!,
      service: 's3',
      region: 'auto',
    });
  }
  return _client;
}

const objUrl = (key: string) => `${ENDPOINT}/${BUCKET}/${key.replace(/^\/+/, '')}`;

/** Upload an object to R2. */
export async function r2Put(key: string, body: ArrayBuffer | Uint8Array, contentType: string): Promise<void> {
  const res = await client().fetch(objUrl(key), {
    method: 'PUT',
    body,
    headers: { 'Content-Type': contentType },
  });
  if (!res.ok) {
    throw Object.assign(new Error(`R2 upload failed (${res.status})`), { status: 502 });
  }
}

/** Fetch an object from R2 (returns the raw Response for streaming). */
export async function r2Get(key: string): Promise<Response> {
  return client().fetch(objUrl(key), { method: 'GET' });
}
