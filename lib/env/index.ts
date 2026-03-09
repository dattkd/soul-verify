import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  STORAGE_PROVIDER: z.enum(['local', 's3']).default('local'),
  LOCAL_STORAGE_PATH: z.string().default('./uploads'),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_REGION: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  NEXT_PUBLIC_APP_URL: z.string().default('http://localhost:3000'),
  THREADS_WEBHOOK_SECRET: z.string().optional(),
  TWITTER_WEBHOOK_SECRET: z.string().optional(),
  INSTAGRAM_WEBHOOK_SECRET: z.string().optional(),
});

function validateEnv() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
    throw new Error('Invalid environment variables');
  }
  return parsed.data;
}

export const env = validateEnv();
export type Env = z.infer<typeof envSchema>;
