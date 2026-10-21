import "dotenv/config";
import process from "node:process";
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().default(3000),
  PROCESSING_DELAY_MS: z.coerce.number().default(30_000),
  WORKER_POLL_MS: z.coerce.number().default(1_000),
  WORKER_CONCURRENCY: z.coerce.number().default(10),
  LEASE_MS: z.coerce.number().default(60_000),
  MAX_ATTEMPTS: z.coerce.number().default(5),
  RETRY_BASE_MS: z.coerce.number().default(5_000),
  SIMULATED_FAILURE_RATE: z.coerce.number().min(0).max(1).default(0),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
    console.error("Invalid environment: ", z.treeifyError(parsed.error));
    process.exit(1);
}

export const env = parsed.data;
