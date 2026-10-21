import { env } from "./config/env";
import { app } from "./app";
import { prisma } from "./lib/prisma";
import { startWorker, stopWorker } from "./worker/worker";

async function main() {
    await prisma.$connect();
    console.log("Database connected");

    const server = app.listen(env.PORT, () => console.log(`Listening on :${env.PORT}`));
    startWorker();

    let shuttingDown = false;
    const shutdown = async (signal: string) => {
        if (shuttingDown) {
            console.warn("Forced exit");
            process.exit(1);
        }
        shuttingDown = true;
        console.log(`${signal} received, shuttingDown`);
        server.close();
        const unfinshed = await stopWorker(25_000);
        if (unfinshed > 0) {
            console.warn(`${unfinshed} job(s) unfinshed: their leases will expire & retried`);
        }
        await prisma.$disconnect();
        process.exit(0);
    }

    process.on("SIGTERM", () => void shutdown("SIGTERM"));
    process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
    console.error("Failed to start : ", err);
    process.exit(1);
});