import { env } from "./config/env";
import { app } from "./app";
import { prisma } from "./lib/prisma";

async function main() {
    await prisma.$connect();
    console.log("Database connected");

    app.listen(env.PORT, () => {
        console.log(`Listening on :${env.PORT}`);
    });
}

main().catch((err) => {
    console.error("Failed to start : ", err);
    process.exit(1);
});