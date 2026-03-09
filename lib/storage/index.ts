import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';

export interface StorageProvider {
  put(key: string, buffer: Buffer, mimeType?: string): Promise<string>;
  get(key: string): Promise<Buffer>;
  getUrl(key: string): string;
  exists(key: string): Promise<boolean>;
}

class LocalStorage implements StorageProvider {
  constructor(private basePath: string, private baseUrl: string) {}

  async put(key: string, buffer: Buffer, _mimeType?: string): Promise<string> {
    const fullPath = path.join(this.basePath, key);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, buffer);
    return key;
  }

  async get(key: string): Promise<Buffer> {
    return fs.readFile(path.join(this.basePath, key));
  }

  getUrl(key: string): string {
    return `${this.baseUrl}/api/assets/${key}`;
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(path.join(this.basePath, key));
      return true;
    } catch {
      return false;
    }
  }
}

class S3Storage implements StorageProvider {
  private client: S3Client;

  constructor(
    private bucket: string,
    private publicUrl: string,
  ) {
    const region = process.env.AWS_REGION ?? 'auto';
    const endpoint = process.env.S3_ENDPOINT; // Required for Cloudflare R2

    this.client = new S3Client({
      region,
      ...(endpoint ? { endpoint } : {}),
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',
      },
      // R2 requires path-style URLs
      forcePathStyle: !!endpoint,
    });
  }

  async put(key: string, buffer: Buffer, mimeType?: string): Promise<string> {
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: buffer,
      ContentType: mimeType ?? 'application/octet-stream',
      CacheControl: 'public, max-age=31536000, immutable',
    }));
    return key;
  }

  async get(key: string): Promise<Buffer> {
    const res = await this.client.send(new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    }));
    if (!res.Body) throw new Error(`Empty body for key: ${key}`);
    const chunks: Uint8Array[] = [];
    for await (const chunk of res.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  getUrl(key: string): string {
    return `${this.publicUrl}/${key}`;
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }));
      return true;
    } catch {
      return false;
    }
  }
}

export function generateStorageKey(prefix: string, ext: string): string {
  const id = crypto.randomBytes(8).toString('hex');
  const date = new Date().toISOString().slice(0, 10);
  return `${prefix}/${date}/${id}${ext}`;
}

let _storage: StorageProvider | null = null;

export function getStorage(): StorageProvider {
  if (_storage) return _storage;
  const provider = process.env.STORAGE_PROVIDER ?? 'local';
  if (provider === 's3') {
    const bucket = process.env.S3_BUCKET;
    if (!bucket) throw new Error('S3_BUCKET env var required when STORAGE_PROVIDER=s3');
    const publicUrl = process.env.S3_PUBLIC_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? '';
    _storage = new S3Storage(bucket, publicUrl);
  } else {
    const basePath = process.env.LOCAL_STORAGE_PATH ?? './uploads';
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
    _storage = new LocalStorage(basePath, baseUrl);
  }
  return _storage;
}
