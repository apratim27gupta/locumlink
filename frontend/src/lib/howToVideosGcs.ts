import { Storage } from '@google-cloud/storage';
import { ensureAdminEnv } from '@/lib/ensure-admin-env';
import { HOW_TO_VIDEOS, type HowToVideo } from '@/lib/howToVideos';

/** Dedicated public-facing demo bucket (may still have PAP enforced). */
export const HOW_TO_VIDEOS_BUCKET =
  process.env.GCS_HOW_TO_VIDEOS_BUCKET?.trim() || 'how-to-videos-l2';

export const HOW_TO_VIDEOS_PREFIX =
  process.env.GCS_HOW_TO_VIDEOS_PREFIX?.trim() || 'How-to-Locumlink2';

const SIGNED_URL_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days (GCS V4 max)

let storage: Storage | null = null;
let initAttempted = false;

function getStorage(): Storage | null {
  ensureAdminEnv();
  if (initAttempted) return storage;
  initAttempted = true;

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
  return storage;
}

export function howToObjectPath(video: HowToVideo): string {
  return `${HOW_TO_VIDEOS_PREFIX}/${video.fileBase}.mp4`;
}

export function getHowToVideoById(id: string): HowToVideo | undefined {
  return HOW_TO_VIDEOS.find((v) => v.id === id);
}

/** Time-limited HTTPS URL for a how-to demo (works with PAP-enforced buckets). */
export async function signHowToVideoUrl(video: HowToVideo): Promise<string> {
  if (video.providerSrc) return video.providerSrc;

  const st = getStorage();
  if (!st) return '';

  try {
    const [url] = await st
      .bucket(HOW_TO_VIDEOS_BUCKET)
      .file(howToObjectPath(video))
      .getSignedUrl({
        version: 'v4',
        action: 'read',
        expires: Date.now() + SIGNED_URL_TTL_MS,
        responseType: 'video/mp4',
      });
    return url;
  } catch {
    return '';
  }
}
