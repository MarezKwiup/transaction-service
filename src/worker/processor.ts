import { env } from "../config/env";
import { sleep } from "../lib/sleep";

// Simulates slow downstream call
export async function callExternalProcessor(transactionId: string): Promise<void> {
    await sleep(env.PROCESSING_DELAY_MS);

    if (Math.random() < env.SIMULATED_FAILURE_RATE) {
        throw new Error(`Simulated upstream failure for ${transactionId}`);
    }
}