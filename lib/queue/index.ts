import { Queue } from 'bullmq';

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';

export function createRedisConnection() {
  const parsed = new URL(redisUrl);
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || '6379', 10),
    ...(parsed.password ? { password: decodeURIComponent(parsed.password) } : {}),
    maxRetriesPerRequest: null as null,
  };
}

export const QUEUE_NAME = 'verification';

export interface VerificationJobData {
  jobId: string;
  sourceUrl?: string;
  mimeType?: string;
  originalFilename?: string;
  storageKey?: string;
  // Bot reply fields (set when job originated from a provider mention)
  requestedByProvider?: string;
  requestedByHandle?: string;
  replyTargetId?: string; // e.g. "comment:123" or "media:456"
}

let _queue: Queue<VerificationJobData> | null = null;

export function getQueue(): Queue<VerificationJobData> {
  if (!_queue) {
    _queue = new Queue<VerificationJobData>(QUEUE_NAME, {
      connection: createRedisConnection(),
      defaultJobOptions: {
        attempts: 1,          // No retries — bad URLs should fail once, not clog the queue
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    });
  }
  return _queue;
}

export async function enqueueVerification(data: VerificationJobData): Promise<void> {
  const queue = getQueue();
  await queue.add('verify', data, { jobId: `verify-${data.jobId}` });
}
