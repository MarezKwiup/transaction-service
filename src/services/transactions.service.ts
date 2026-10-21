import { prisma } from "../lib/prisma";
import type { Transaction } from "@prisma/client";

export type TransactionInput = {
    transaction_id: string;
    source_account: string;
    destination_account: string;
    amount: number;
    currency: string;
}

export async function ingestTransaction(input: TransactionInput) {
    const { count } = await prisma.transaction.createMany({
        data: [
            {
                transactionId: input.transaction_id,
                sourceAccount: input.source_account,
                destinationAccount: input.destination_account,
                amount: input.amount,
                currency: input.currency
            }
        ],
        skipDuplicates: true, // Insert : On conflict do nothing
    })

    return { created: count === 1 };
}

function toApi(t: Transaction) {
    return {
        transaction_id: t.transactionId,
        source_account: t.sourceAccount,
        destination_account: t.destinationAccount,
        amount: t.amount.toNumber(),
        currency: t.currency,
        status: t.status,
        created_at: t.createdAt.toISOString(),
        processed_at: t.processedAt ? t.processedAt.toISOString() : null,
    };
}

export async function getTransaction(transactionId: string) {
    const row = await prisma.transaction.findUnique({
        where: { transactionId }
    })
    return row ? toApi(row) : null;
}