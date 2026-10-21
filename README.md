# Transaction Webhook Service

This service retrieves transaction webhooks from payment processors, acknowledges them immediately and processes them in the background.

** Live API:**  'https://transaction-service-u9fq.onrender.com'

> Built in **Node.js + TypeScript** (the brief says Python; the recruiter confirmed Node.js was fine).


---
 
## Endpoints
 
| Method | Path | Purpose |
|---|---|---|
| `GET` | `/` | Health check: `{ "status": "HEALTHY", "current_time": "..." }` |
| `POST` | `/v1/webhooks/transactions` | Receive a transaction webhook and return `202 Accepted` |
| `GET` | `/v1/transactions/:transaction_id` | Transaction status (for testing) |
 
**Webhook request**
 
```json
{
  "transaction_id": "txn_abc123def456",
  "source_account": "acc_user_789",
  "destination_account": "acc_merchant_456",
  "amount": 1500,
  "currency": "INR"
}
```
 
**Webhook response** (`202`, for both new and duplicate deliveries):
 
```json
{ "acknowledged": true, "transaction_id": "txn_abc123def456", "duplicate": false }
```
 
**Status response** (`200`, or `404` if unknown):
 
```json
[{
  "transaction_id": "txn_abc123def456",
  "source_account": "acc_user_789",
  "destination_account": "acc_merchant_456",
  "amount": 1500,
  "currency": "INR",
  "status": "PROCESSED",
  "created_at": "2026-10-21T12:00:00.000Z",
  "processed_at": "2026-10-21T12:00:30.412Z"
}]
```
 
`status` is `PROCESSING`, `PROCESSED`, or `FAILED` (see [Notes on the spec](#notes-on-the-spec)).
 
---
 
## How it works
 
```
 Processor ──POST──▶  API  ──INSERT ... ON CONFLICT DO NOTHING──▶  Postgres  ──▶ 202
                                                                      ▲
                                    claim (lease, FOR UPDATE SKIP LOCKED)
                                                                      │
                                                Worker (same process) ┘
                                         wait 30s (simulated external call)
                                         ──▶ mark PROCESSED / schedule retry
```
 
1. **Receive.** The webhook is validated and written with a single idempotent insert: transaction.createMany , then `202` is returned. Nothing else happens in the request path, so latency doesn't depend on how much work is queued.
2. **Claim.** A background worker polls every second with (FOR UPDATE SKIP LOCKED) and atomically claims due rows by giving each a lease (`locked_until`).
3. **Process.** It waits 30s to simulate the external API call, then marks the row `PROCESSED` with `processed_at`.
4. **Recover.** If processing fails, the row is retried with exponential backoff. If the process crashes, the lease expires and the row is reclaimed.
---

## Technical choices
 
### Postgres is both the store and the queue
There is no Redis or separate broker. Every row in the transaction table starts a job for the worker. The gives a single source of truth and single thing to deploy. At much higher volumes, I'd move the queue to BullMq and keep Postgres as source of truth.
 
### Idempotency is enforced by the database, not application code
`transaction_id` is the primary key, and transaction dont via is `INSERT ... ON CONFLICT DO NOTHING`. This is atomic, so even simultaneous duplicate deliveries across multiple instances can't create two rows.
 
### Never acknowledge before the write commits
`202` is only returned after the row is committed. If the database is unavailable, the request fails with `500`, and the processor's own retry mechanism redelivers it later.
 
### Leases and fencing make background processing crash-safe
- The worker claims rows with one atomic `UPDATE ... WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED) RETURNING`. `SKIP LOCKED` lets multiple instances claim disjoint rows without blocking each other, so the worker scales horizontally.
- The row lock lasts only for the claim. The 30s of work runs outside any transaction, protected by a **lease** (`locked_until`, 60s). If the process dies mid-work, the lease expires and the row is reclaimed. **The lease is the guarantees claiming is atomic for multiple workers.**.
- Each claim increments `attempts`, which acts as a **fencing token**: completion only succeeds `WHERE attempts = <value I claimed>`. A worker that stalls past its lease can't overwrite the result of the worker that reclaimed the row.
### Retries are bounded
Failures are retried with exponential backoff (5s, 10s, 20s, ... capped at 5 min). After `MAX_ATTEMPTS` (5), the row is marked `FAILED` with `last_error` set, so it's visible instead of retrying forever.
 
### Other decisions
- **Graceful shutdown.** On `SIGTERM` the server stops accepting requests and waits up to 25s for in-flight jobs.
- **Fail fast at boot.** Environment variables are validated with zod, and the DB connection is opened before the server listens. So a misconfigured deploy doesnt deploy, and first webhook doesnt pay latency cost.
**Stack:** Node.js 22, TypeScript, Express 5, Prisma 6, zod, PostgreSQL (Neon), Render.
 
---
 
## Running locally
 
**Prerequisites:** Node 22+ and a Postgres database (e.g. a free [Neon](https://neon.tech) project).
 
```bash
git clone https://github.com/YOUR-USERNAME/txn-webhook-service.git
cd txn-webhook-service
npm install
cp .env.example .env        # set DATABASE_URL
npx prisma migrate deploy   # create the schema
npm run dev                 # API on :3000 with the worker running
```
 
Use a **direct** (non-pooled) connection string. For Neon, remove `channel_binding=require` and add `connect_timeout=30`, e.g.:
 
```
postgresql://USER:PASSWORD@HOST/neondb?sslmode=require&connect_timeout=30
```
 
### Configuration
 
| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | (required) | Postgres connection string |
| `PORT` | `3000` | HTTP port |
| `PROCESSING_DELAY_MS` | `30000` | Simulated external call duration |
| `WORKER_POLL_MS` | `1000` | How often the worker checks for due rows |
| `WORKER_CONCURRENCY` | `10` | Max transactions processed in parallel per instance |
| `LEASE_MS` | `60000` | How long a claim lasts (must exceed the processing time) |
| `MAX_ATTEMPTS` | `5` | Attempts before a transaction is marked `FAILED` |
| `RETRY_BASE_MS` | `5000` | Base for exponential backoff |
| `SIMULATED_FAILURE_RATE` | `0` | 0–1; makes the simulated call fail, to exercise retries |
 
---
 
## Testing
 
The test scripts cover the success criteria. They run against any deployment through `BASE_URL`, print `PASS`/`FAIL`, and exit non-zero on failure.
 
```bash
export BASE_URL=https://YOUR-SERVICE.onrender.com   # or http://localhost:3000
 
npm run test:single       # one webhook → 202, then PROCESSED ~30s later
npm run test:duplicates   # 20 identical webhooks at once + 3 late retries → exactly one transaction
npm run test:load         # 50 slow jobs queued, then 200 webhooks at concurrency 20 → p99 < 500ms
```
 
`test:load` accepts `BACKGROUND`, `TOTAL` and `CONCURRENCY` environment variables.


 
### Results against the live deployment
 
| Test | Result |
|---|---|
| Single transaction | PASS: webhooks acknowledged with 202 in 292ms. Waiting for processing.............. . ✅ PASS: processed 30.8s after receipt |
| Duplicate prevention | ✅ PASS: 20 concurrent deliveries: all 202, exactly 1 created the transaction. ✅ PASS: 3 late retries: all 202 and flagged as duplicate . Waiting for processing............... . ✅ PASS: txn_dup_1792587768571_448jr5 processed once (a single server log) |
| Performance under load | Target: https://transaction-service-u9fq.onrender.com . Queued 50 background transactions (worker is now busy). 200 requests, concurrency 20, 157 req/s . p50 109ms : p95 203ms : p99 257ms : max 262ms . ✅ PASS: all 202, p99 under 500ms while background jobs were running|
 
Client-side latency includes the network round trip from the test machine. Server-side response times appear in the request logs.
 
### Manual checks
 
```bash
# Health
curl $BASE_URL/
 
# Send a webhook (run it twice: the second response has "duplicate": true)
curl -X POST $BASE_URL/v1/webhooks/transactions -H "Content-Type: application/json" \
  -d '{"transaction_id":"txn_demo_1","source_account":"acc_user_789","destination_account":"acc_merchant_456","amount":1500,"currency":"INR"}'
 
# Status: PROCESSING now, PROCESSED after ~30s
curl $BASE_URL/v1/transactions/txn_demo_1
```
 
**Crash recovery (locally).** Set `LEASE_MS=40000`, send a webhook, then force-kill the server (Ctrl+C twice) within 30s. Restart it: the row stays `PROCESSING` until the lease expires, then it's reclaimed and processed with `attempts = 2`.
 
**Retries and `FAILED` (locally).** Set `PROCESSING_DELAY_MS=1000`, `SIMULATED_FAILURE_RATE=1`, `MAX_ATTEMPTS=3`, `RETRY_BASE_MS=2000`, then send a webhook. The logs show retries with backoff, and the row ends as `FAILED` with `last_error` set.
 
---
 
## Notes on the spec
 
- **Status response is an array.** The spec's example wraps a single transaction in an array, so the endpoint matches it exactly.
- **`FAILED` status added.** The spec lists `PROCESSING` and `PROCESSED`. A bounded retry policy needs a terminal failure state, so transactions that exhaust their retries are marked `FAILED` instead of retrying forever.
---
 
## Trade-offs and what I'd add next
 
- **At-least-once processing.** If the external call succeeds but the process crashes before writing `PROCESSED`, the call runs again. That's inherent to any queue. The standard fix is to send `transaction_id` as an idempotency key to the downstream API (the processor tasks), so a repeated call has no extra effect.
- **Separate worker process.** The API and worker share a process for simplicity. They could be split so each scales independently, with no code changes to the claim logic.
- **Duplicate payload mismatch.** Detect and log when a duplicate `transaction_id` arrives with a different payload.
- **Observability.** Metrics for queue depth, processing latency and failure rate; structured logging.
- **Automated tests** with Jest and supertest, plus CI.
---
 
## Project structure
 
```
prisma/
  schema.prisma          data model (transaction = job)
  migrations/
src/
  index.ts               boot: connect DB, start server and worker, graceful shutdown
  app.ts                 Express app and routes
  config/env.ts          validated environment
  routes/                webhooks, transactions
  services/              ingestion and lookup
  worker/                claim / process / retry loop, simulated external call
  middleware/errors.ts   404 and error handling
  lib/                   Prisma client, helpers
scripts/                 test scripts for the success criteria
```

---
 
## My takeaways
 
- Really enjoyed this project, it helped me acknowledge the intricacies of different types of prisma transactions to guarantee idempotency & setup a queue that use db as a source of truth.
---
 
 