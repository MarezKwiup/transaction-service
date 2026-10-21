import process from "node:process";

export const BASE_URL = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function pass(msg: string) {
    console.log(`✅ PASS: ${msg}`);
}

export function fail(msg: string): never {
  console.error(`❌ FAIL: ${msg}`);
  process.exit(1);
}

export function makeTxn(prefix = "test") {
    return {
        transaction_id: `txn_${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        source_account: "acc_user_789",
        destination_account: "acc_merchant_456",
        amount: 1500,
        currency: "INR",
    };
}

export async function postWebhook(body: object) {
    const start = performance.now();
    const res = await fetch(`${BASE_URL}/v1/webhooks/transactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    const ms = performance.now() - start;
    const json = (await res.json().catch(() => null)) as { duplicate?: boolean } | null;
    return { status: res.status, ms, json };
}

type Txn = {
    status: string;
    created_at: string;
    processed_at: string | null;
}

export async function getTxn(id: string): Promise<Txn | null> {
    const res = await fetch(`${BASE_URL}/v1/transactions/${id}`);
    if (res.status === 404) return null;
    const [txn] = (await res.json()) as Txn[];
    return txn;
}

export async function  waitForProcessed(id: string, timeoutMs = 120_000): Promise<Txn> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const txn = await getTxn(id);
        if (!txn) fail(`${id} not found`);
        if (txn.status === "PROCESSED") return txn;
        if (txn.status === "FAILED") fail(`${id} ended as FAILED`);
        process.stdout.write(".");
        await sleep(2_000);
    }
    fail(`${id} not processed within ${timeoutMs / 1000}s`);
}


