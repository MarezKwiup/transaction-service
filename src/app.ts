import express from "express";
import morgan from "morgan";
import { webhooksRouter } from "./routes/webhooks";
import { transactionsRouter } from "./routes/transactions";
import { errorHandler, notFound } from "./middleware/errors";

export const app = express();

app.disable("x-powered-by");
app.use(express.json({ limit: "100kb" }));
app.use(morgan("tiny"));

app.get("/", (_req, res) => {
    res.json({ status: "HEALTHY", current_time: new Date().toISOString() });
})

app.use("/v1/webhooks", webhooksRouter);
app.use("/v1/transactions", transactionsRouter);

app.use(notFound);
app.use(errorHandler);
