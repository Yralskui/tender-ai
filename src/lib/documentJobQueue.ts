/**
 * Очередь тяжёлого AI-разбора документов (Redis или память).
 * Worker забирает задачи — Next.js не блокируется на 4+ минуты Vision.
 */

import "server-only";

import type Redis from "ioredis";
import { dequeueJsonLine, enqueueJsonLine, queueJsonLength } from "./fileJobQueue";

export interface DocumentAnalysisJob {
  documentId: string;
  companyId: string;
  enqueuedAt: string;
}

const QUEUE_KEY = "queue:document-analysis";
const FILE_QUEUE_NAME = "document-analysis";

let redisClient: Redis | null = null;

async function getRedis(): Promise<Redis | null> {
  const url = process.env.REDIS_URL?.trim();
  if (!url) return null;
  if (redisClient) return redisClient;
  const { default: RedisCtor } = await import("ioredis");
  redisClient = new RedisCtor(url, { maxRetriesPerRequest: 2, lazyConnect: true });
  await redisClient.connect();
  return redisClient;
}

export async function enqueueDocumentAnalysisJob(
  job: DocumentAnalysisJob
): Promise<void> {
  const redis = await getRedis();
  if (redis) {
    await redis.rpush(QUEUE_KEY, JSON.stringify(job));
    return;
  }
  await enqueueJsonLine(FILE_QUEUE_NAME, job);
}

export async function dequeueDocumentAnalysisJob(): Promise<DocumentAnalysisJob | null> {
  const redis = await getRedis();
  if (redis) {
    const raw = await redis.lpop(QUEUE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as DocumentAnalysisJob;
    } catch {
      return null;
    }
  }
  return dequeueJsonLine<DocumentAnalysisJob>(FILE_QUEUE_NAME);
}

export async function documentQueueLength(): Promise<number> {
  const redis = await getRedis();
  if (redis) return redis.llen(QUEUE_KEY);
  return queueJsonLength(FILE_QUEUE_NAME);
}
