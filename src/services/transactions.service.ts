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
        
    }
}