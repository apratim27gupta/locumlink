import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Storage } from '@google-cloud/storage';
import { randomUUID } from 'node:crypto';

@Injectable()
export class GcsService {
  private readonly logger = new Logger(GcsService.name);
  private readonly storage: Storage;
  private readonly bucket: string;

  constructor(private readonly config: ConfigService) {
    const keyFile   = this.config.get<string>('GCS_KEY_FILE');
    const projectId = this.config.get<string>('GCS_PROJECT_ID');

    this.storage = new Storage({ projectId, keyFilename: keyFile });
    this.bucket  = this.config.getOrThrow<string>('GCS_BUCKET_NAME');
  }

  async upload(
    buffer: Buffer,
    folder: string,
    originalName: string,
    contentType: string,
  ): Promise<string> {
    const ext  = originalName.split('.').pop()?.toLowerCase() ?? 'bin';
    const path = `${folder}/${randomUUID()}.${ext}`;
    await this.storage
      .bucket(this.bucket)
      .file(path)
      .save(buffer, { metadata: { contentType }, resumable: false });
    this.logger.log(`Uploaded: ${path}`);
    return path;
  }

  async signedUrl(path: string): Promise<string> {
    if (!path) return '';
    if (path.startsWith('http')) return path;
    try {
      const [url] = await this.storage
        .bucket(this.bucket)
        .file(path)
        .getSignedUrl({ action: 'read', expires: Date.now() + 3_600_000 });
      return url;
    } catch (err) {
      this.logger.warn(`Could not sign "${path}": ${String(err)}`);
      return '';
    }
  }

  async delete(path: string): Promise<void> {
    if (!path || path.startsWith('http')) return;
    try {
      await this.storage.bucket(this.bucket).file(path).delete();
    } catch { }
  }
}