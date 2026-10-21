import process from "node:process";
import { BASE_URL, fail, makeTxn, pass, postWebhook, waitForProcessed } from "./lib";

async function main() {
    console.log(`Target: ${BASE_URL}`);
    const txn = makeTxn("single");

    const r = await postWebhook(txn);
    if (r.status !== 202) fail(`expected 202, got ${r.status}`);
    pass(`webhooks acknowledged with 202 in ${r.ms.toFixed(0)}ms`);

    process.stdout.write("Waiting for processing");
    const done = await waitForProcessed(txn.transaction_id);
    console.log();

    const seconds = (Date.parse(done.processed_at!) - Date.parse(done.created_at)) / 1000;
    if (seconds < 29) fail(`processed after ${seconds}s, expected ~30s`);
    pass(`processed ${seconds.toFixed(1)}s after receipt`);
}

main().catch((e) => fail(String(e)));