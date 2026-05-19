import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Storage } from '@google-cloud/storage';
import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
@Injectable()
export class GcsService {
    private readonly logger = new Logger(GcsService.name);
    private readonly storage: Storage;
    private readonly bucket: string;
    constructor(private readonly config: ConfigService) {
        const projectId = this.config.get<string>('GCS_PROJECT_ID');
        const keyFile = this.config.get<string>('GCS_KEY_FILE');
        const credentialsJson = this.config.get<string>('GCS_CREDENTIALS_JSON');
        let credentials: {
            client_email?: string;
            private_key?: string;
            [k: string]: unknown;
        } | undefined;
        if (credentialsJson) {
            try {
                credentials = JSON.parse(credentialsJson) as {
                    client_email?: string;
                    private_key?: string;
                    [k: string]: unknown;
                };
            }
            catch (err) {
                this.logger.warn(`GCS_CREDENTIALS_JSON is set but not valid JSON: ${String(err)}`);
            }
        }
        this.storage = new Storage({
            ...(projectId ? { projectId } : {}),
            ...(credentials ? { credentials } : {}),
            ...(!credentials && keyFile ? { keyFilename: keyFile } : {}),
        });
        this.bucket = this.config.getOrThrow<string>('GCS_BUCKET_NAME');
    }
    async upload(buffer: Buffer, folder: string, originalName: string, contentType: string): Promise<string> {
        const ext = originalName.split('.').pop()?.toLowerCase() ?? 'bin';
        const path = `${folder}/${randomUUID()}.${ext}`;
        await this.storage
            .bucket(this.bucket)
            .file(path)
            .save(buffer, { metadata: { contentType }, resumable: false });
        this.logger.log(`Uploaded: ${path}`);
        return path;
    }
    /** Stream from disk temp file — avoids holding full file in heap after multer diskStorage. */
    async uploadFromPath(localPath: string, folder: string, originalName: string, contentType: string): Promise<string> {
        const ext = originalName.split('.').pop()?.toLowerCase() ?? 'bin';
        const path = `${folder}/${randomUUID()}.${ext}`;
        const gcsFile = this.storage.bucket(this.bucket).file(path);
        try {
            await pipeline(
                createReadStream(localPath),
                gcsFile.createWriteStream({ metadata: { contentType }, resumable: false }),
            );
            this.logger.log(`Uploaded: ${path}`);
            return path;
        }
        finally {
            await unlink(localPath).catch(() => { });
        }
    }
    async signedUrl(path: string): Promise<string> {
        if (!path)
            return '';
        if (path.startsWith('http'))
            return path;
        try {
            const [url] = await this.storage
                .bucket(this.bucket)
                .file(path)
                .getSignedUrl({ action: 'read', expires: Date.now() + 3600000 });
            return url;
        }
        catch (err) {
            this.logger.warn(`Could not sign "${path}": ${String(err)}`);
            return '';
        }
    }
    async delete(path: string): Promise<void> {
        if (!path || path.startsWith('http'))
            return;
        try {
            await this.storage.bucket(this.bucket).file(path).delete();
        }
        catch { }
    }
}
