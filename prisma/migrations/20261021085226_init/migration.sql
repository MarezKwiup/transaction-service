-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('PROCESSING', 'PROCESSED', 'FAILED');

-- CreateTable
CREATE TABLE "transactions" (
    "transaction_id" VARCHAR(128) NOT NULL,
    "source_account" VARCHAR(128) NOT NULL,
    "destination_account" VARCHAR(128) NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "status" "TransactionStatus" NOT NULL DEFAULT 'PROCESSING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_until" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("transaction_id")
);

-- CreateIndex
CREATE INDEX "transactions_status_next_attempt_at_idx" ON "transactions"("status", "next_attempt_at");
