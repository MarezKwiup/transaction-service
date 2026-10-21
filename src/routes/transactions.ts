import { Router } from "express";
import { getTransaction } from "../services/transactions.service";

export const transactionsRouter = Router();

transactionsRouter.get("/:transaction_id", async (req, res) => {
    const txn = await getTransaction(req.params.transaction_id);
    if (!txn) {
        res.status(404).json({
            error: "NOT_FOUND",
            message: "Transaction not found"
        });
        return;
    }

    res.json([txn]);
})