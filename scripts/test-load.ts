import process from "node:process";
import { BASE_URL, fail, makeTxn, pass, postWebhook } from "./lib";

const BACKGROUND = Number(process.env.BACKGROUND ?? 50);
const TOTAL = Number(process.env.TOTAL ?? 200);
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 20);

const pct = (sorted: number[], p: number) =>
  sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)];

async function main() {
    console.log(`Target: ${BASE_URL}`);
    await fetch(`${BASE_URL}/`);

    await Promise.all(Array.from({ length: BACKGROUND }, () => postWebhook(makeTxn("bg"))));
    console.log(`Queued ${BACKGROUND} background transactions (worker is now busy)`);

    const latencies: number[] = [];
    let errors = 0;
    let sent = 0;

    const sender = async () => {
        while(sent < TOTAL) {
            sent++;
            const r = await(postWebhook(makeTxn("load")));
            if (r.status !== 202) errors++;
            latencies.push(r.ms);
        }
    };
    const start = performance.now();
    await Promise.all(Array.from({ length: CONCURRENCY }, sender));
    const elapsed = (performance.now() - start) / 1000;
    latencies.sort((a, b) => a - b);
    console.log(`${TOTAL} requests, concurrency ${CONCURRENCY}, ${(TOTAL / elapsed).toFixed(0)} req/s`);
    console.log(
        `p50 ${pct(latencies, 50).toFixed(0)}ms | p95 ${pct(latencies, 95).toFixed(0)}ms | ` +
        `p99 ${pct(latencies, 99).toFixed(0)}ms | max ${latencies.at(-1)!.toFixed(0)}ms`,
    )

    if (errors) fail(`${errors} requests did not return 202`);
    if (pct(latencies, 99) > 500) fail("p99 latency over 500ms");
    pass("all 202, p99 under 500ms while background jobs were running");
}

main().catch((e) => fail(String(e)));