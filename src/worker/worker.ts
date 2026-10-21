import { prisma } from "../lib/prisma";
import { env } from "../config/env";
import { callExternalProcessor } from "./processor";

type Claimed = {
    transaction_id: string;
    attempts: number;
}

let running = false;
let timer: NodeJS.Timeout | undefined;
const inFlight = new Set<Promise<void>>();

async function claimBatch(limit: number): Promise<Claimed[]> {
    return prisma.$queryRaw<Claimed[]>`
        UPDATE transactions
        SET locked_until = now() + (${env.LEASE_MS}::int * interval '1 millisecond'),
            attempts = attempts + 1,
            updated_at = now()
        WHERE transaction_id  IN (
            SELECT transaction_id
            FROM transactions
            WHERE status = 'PROCESSING'
                AND next_attempt_at <= now()
                AND (locked_until is NULL OR locked_until < now())
        ORDER BY next_attempt_at
        LIMIT ${limit}::int
        FOR UPDATE SKIP LOCKED
        )
        RETURNING transaction_id, attempts
    `;
}

async function processOne({ transaction_id: id, attempts }: Claimed): Promise<void> {
    try {
        await callExternalProcessor(id);

        const { count } = await prisma.transaction.updateMany({
            where: { transactionId: id, status: "PROCESSING", attempts },
            data: {
                status: "PROCESSED",
                processedAt: new Date(),
                lockedUntil: null,
                lastError: null
            }
        });

        if (count === 0) console.warn(`[worker] ${id}: lease lost to another claim, result discarded`);
        else console.log(`[worker] ${id}: PROCESSED (attempt ${attempts})`);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const exhausted = attempts >= env.MAX_ATTEMPTS;
        const backoffMs = Math.min(env.RETRY_BASE_MS * 2 ** (attempts - 1), 5 * 60_000);

        await prisma.transaction
            .updateMany({
                where: {
                    transactionId: id,
                    status: "PROCESSING",
                    attempts,
                },
                data: exhausted
                    ? { status: "FAILED", lockedUntil : null, lastError: message }
                    : { lockedUntil: null, lastError: message, nextAttemptAt: new Date(Date.now() + backoffMs) },
            })
            .catch((e) => {
                console.error(`[worked] ${id}: could not record failure`, e);
            });
        
        console.error(
            exhausted
                ? `[worker] ${id}: FAILED after ${attempts} attempts: ${message}`
                : `[worker] ${id}: attempt ${attempts} failed, retrying in ${backoffMs / 1000}s : ${message}`,
        );
    }
}

async function tick(): Promise<void> {
    if (!running) return;
    try {
        const free = env.WORKER_CONCURRENCY - inFlight.size;
        if (free > 0) {
            const batch = await claimBatch(free);
            for (const job of batch) {
                const p: Promise<void> = processOne(job).finally(() => inFlight.delete(p));
                inFlight.add(p);
            }
        }
    } catch (err) {
        console.log("[worker] poll failed : ", err);
    } finally {
        if (running) timer = setTimeout(tick, env.WORKER_POLL_MS);
    }
}

export function startWorker(): void {
    running = true;
    console.log(
        `[worker] started (concurrency=${env.WORKER_CONCURRENCY}, delay=${env.PROCESSING_DELAY_MS}ms, lease=${env.LEASE_MS}ms)`,
    );
    void tick();
}

export async function stopWorker(timeoutMs: number): Promise<number> {
    running = false;
    clearTimeout(timer);
    await Promise.race([
        Promise.allSettled([...inFlight]),
        new Promise((resolve) => setTimeout(resolve, timeoutMs))
    ]);
    return inFlight.size;
}