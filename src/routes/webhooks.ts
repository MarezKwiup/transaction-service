import { Router } from "express";
import { z } from "zod";
import { ingestTransaction } from "../services/transactions.service";

const id = z.string().trim().min(1).max(128);

const webhookSchema = z.object({
    transaction_id: id,
    source_account: id,
    destination_account: id,
    amount: z.number().positive().max(1e12),
    currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Must be an ISO 4217 code"),
});

export const webhooksRouter = Router();

webhooksRouter.post("/transactions", async (req, res) => {
    const parsed = webhookSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({
            error: "INVALID_PAYLOAD",
            details: z.flattenError(parsed.error).fieldErrors,
        });
        return;
    }

    const { created } = await ingestTransaction(parsed.data);

    res.status(202).json({
        acknowledged: true,
        transaction_id: parsed.data.transaction_id,
        duplicate: !created,
    });
});