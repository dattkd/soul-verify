import 'dotenv/config';
import { Worker, Job } from 'bullmq';
import { createRedisConnection, QUEUE_NAME, VerificationJobData } from '../lib/queue';
import { runVerificationPipeline } from '../lib/verify/pipeline';
import { getStorage } from '../lib/storage';
import { getProvider } from '../lib/providers';
import { prisma } from '../lib/db/client';
import { VERDICT_LABELS, Verdict } from '../lib/scoring/types';

console.log('[worker] Soul Verify worker starting...');

const worker = new Worker<VerificationJobData>(
  QUEUE_NAME,
  async (job: Job<VerificationJobData>) => {
    const { jobId } = job.data;
    console.log(`[worker] Processing job ${jobId}`);

    // Load buffer from storage if pre-uploaded
    let buffer: Buffer | undefined;
    if (job.data.storageKey) {
      const storage = getStorage();
      buffer = await storage.get(job.data.storageKey);
    }

    // Run the verification pipeline with a hard 3-minute timeout
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Pipeline timeout after 3 minutes')), 180_000),
    );
    await Promise.race([
      runVerificationPipeline({
        jobId,
        buffer,
        sourceUrl: job.data.sourceUrl,
        mimeType: job.data.mimeType,
        originalFilename: job.data.originalFilename,
      }),
      timeout,
    ]);

    // ── Bot reply (if job came from a provider mention) ───────────────────
    if (job.data.requestedByProvider) {
      await sendBotReply(job.data);
    }

    console.log(`[worker] Completed job ${jobId}`);
  },
  {
    connection: createRedisConnection(),
    concurrency: 3,
    lockDuration: 300_000,    // 5 min — prevents stall detection on slow jobs
    lockRenewTime: 60_000,    // Renew lock every 60s
  },
);

async function sendBotReply(jobData: VerificationJobData): Promise<void> {
  const { jobId, requestedByProvider, requestedByHandle, replyTargetId } = jobData;
  if (!requestedByProvider) return;

  const provider = getProvider(requestedByProvider);
  if (!provider) return;

  try {
    // Fetch the completed job + report
    const dbJob = await prisma.verificationJob.findUnique({
      where: { id: jobId },
      include: { analysisResult: true, publicReport: true },
    });

    if (!dbJob?.analysisResult || !dbJob?.publicReport) {
      console.warn(`[worker] No analysis/report found for job ${jobId}, skipping reply`);
      return;
    }

    const { verdict, confidence } = dbJob.analysisResult;
    const verdictLabel = VERDICT_LABELS[verdict as Verdict] ?? verdict;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
    const reportUrl = `${appUrl}/r/${dbJob.publicReport.publicToken}`;

    const replyText = provider.formatReply(verdictLabel, confidence, reportUrl);

    const success = await provider.postReply(
      requestedByHandle ?? '',
      replyText,
      replyTargetId,
    );

    if (success) {
      console.log(`[worker] Reply sent via ${requestedByProvider} for job ${jobId}`);
    } else {
      console.warn(`[worker] Reply failed via ${requestedByProvider} for job ${jobId}`);
    }
  } catch (err) {
    console.error(`[worker] Error sending reply for job ${jobId}:`, err);
  }
}

worker.on('failed', (job, err) => {
  console.error(`[worker] ✗ ${job?.id} failed:`, err.message);
});

process.on('SIGTERM', async () => {
  console.log('[worker] Shutting down...');
  await worker.close();
  process.exit(0);
});
