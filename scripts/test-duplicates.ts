import process from "node:process";
import { BASE_URL, fail, makeTxn, pass, postWebhook, waitForProcessed } from "./lib";

const N = 20;

async function main() {
    console.log(`Target: ${BASE_URL}`);
    const txn = makeTxn("dup");
    
    // Race: N identical deliveries at same moment.
    const burst = await Promise.all(Array.from({ length: N}, () => postWebhook(txn)));
    const non202 = burst.filter((r) => r.status !== 202);
    if (non202.length) fail(`${non202.length} responses were not 202: ${non202.map((r) => r.status)}`);

    const created = burst.filter((r) => r.json?.duplicate === false).length;
    if (created !==1 ) fail(`expected exactly 1 to create a new transaction, got ${created}`);
    pass(`${N} concurrent deliveries: all 202, exactly 1 created the transaction`);

    // Late retries.
    for (let i = 0; i < 3; i++) {
        const r = await postWebhook(txn);
        if (r.status !== 202 || r.json?.duplicate !== true) fail("late retry was not treated as duplicate");
    }
    pass("3 late retries: all 202 and flagged as duplicate");

    process.stdout.write("Waiting for processing");
    await waitForProcessed(txn.transaction_id);
    console.log();
    pass(`${txn.transaction_id} processed once (a single server log)`);
}

main().catch((e) => fail(String(e)));