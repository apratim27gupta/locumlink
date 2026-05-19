import { Storage } from '@google-cloud/storage';
import { ensureAdminEnv } from '@/lib/ensure-admin-env';

let storage: Storage | null = null;
let bucketName: string | null = null;
let initAttempted = false;

function getStorage(): { storage: Storage; bucket: string } | null {
  ensureAdminEnv();
  if (initAttempted && (!storage || !bucketName)) return null;
  initAttempted = true;

  const bucket = process.env.GCS_BUCKET_NAME?.trim() ?? '';
  if (!bucket) return null;

  const projectId = process.env.GCS_PROJECT_ID;
  const keyFile = process.env.GCS_KEY_FILE;
  const credentialsJson = process.env.GCS_CREDENTIALS_JSON;
  let credentials: { client_email?: string; private_key?: string } | undefined;
  if (credentialsJson) {
    try {
      credentials = JSON.parse(credentialsJson) as {
        client_email?: string;
        private_key?: string;
      };
    } catch {
      credentials = undefined;
    }
  }

  storage = new Storage({
    ...(projectId ? { projectId } : {}),
    ...(credentials ? { credentials } : {}),
    ...(!credentials && keyFile ? { keyFilename: keyFile } : {}),
  });
  bucketName = bucket;
  return { storage, bucket: bucketName };
}

/** Returns a time-limited read URL for a GCS object path or passthrough http URL. */
export async function signGcsPath(path: string | null | undefined): Promise<string> {
  const trimmed = path?.trim() ?? '';
  if (!trimmed) return '';
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;

  const cfg = getStorage();
  if (!cfg) return '';

  try {
    const [url] = await cfg.storage
      .bucket(cfg.bucket)
      .file(trimmed)
      .getSignedUrl({ action: 'read', expires: Date.now() + 3600000 });
    return url;
  } catch {
    return '';
  }
}
