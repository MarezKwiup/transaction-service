import express from "express";
import morgan from "morgan";
import { webhooksRouter } from "./routes/webhooks";

export const app = express();

app.use(express.json({ limit: "100kb" }));
app.use(morgan("tiny"));

app.get("/", (_req, res) => {
    res.json({ status: "HEALTHY", current_time: new Date().toISOString() });
})

app.use("/v1/webhooks", webhooksRouter);
