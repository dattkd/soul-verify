import type { ProviderAdapter } from './types';
import { ThreadsProvider } from './threads';
import { TwitterProvider } from './twitter';
import { InstagramProvider } from './instagram';

const providers: Record<string, ProviderAdapter> = {
  threads: new ThreadsProvider(),
  twitter: new TwitterProvider(),
  instagram: new InstagramProvider(),
};

export function getProvider(name: string): ProviderAdapter | null {
  return providers[name] ?? null;
}

export function getAllProviders(): ProviderAdapter[] {
  return Object.values(providers);
}

export type { ProviderAdapter, MentionEvent, VerificationRequest, BotReply } from './types';
