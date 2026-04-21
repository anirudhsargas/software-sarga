# Reservation & Concurrency Verification

This document describes how to verify the booking-time reservation behavior added to the codebase and includes a small integration script that simulates concurrent reservation attempts.

## Goals
- Verify that booking (reservation) prevents double-use of stock.
- Verify that payment consumes reserved stock (reserved_quantity and quantity both decrement).
- Provide an automated smoke script to simulate concurrency and manual verification steps.

## Automated smoke test (simulates two concurrent reservations)

File: `server/tests/reservationTest.js`

Prerequisites:
- A running MySQL instance and the application database (the script will create and delete a single test inventory row).
- Set the following environment variables (or edit the defaults in the script):
  - `DB_HOST` (default: `localhost`)
  - `DB_USER` (default: `root`)
  - `DB_PASS` (default: ``)
  - `DB_NAME` (default: `sarga`)

Run (from repo root):

```bash
# from repo root
cd server
node tests/reservationTest.js
```

Expected outcome:
- The script will insert a temporary `sarga_inventory` row with `quantity=2` and `reserved_quantity=0`.
- It will run two concurrent attempts to reserve `2` units each. One attempt should succeed, the other should fail due to insufficient available stock.
- Exit code `0` indicates PASS; non-zero indicates failure.

## Manual verification steps

1. Start with a known inventory row (or create a temporary one):
   - `SELECT id, quantity, reserved_quantity FROM sarga_inventory WHERE sku = 'your-sku'`.
2. Create two booking attempts (via the UI or by calling the booking endpoint) near-simultaneously that together exceed available stock.
   - If booking uses the `customer-payments` flow, the server will create jobs and reserve stock at job creation.
3. Observe the result of the second booking attempt: it should return HTTP `409` with an "Insufficient stock" message.
4. Complete payment for the booked job and verify:
   - `quantity` has been decremented by the consumed amount and
   - `reserved_quantity` has also been decremented by the consumed amount (so reserved does not linger).

## Notes and caveats
- The test script operates directly on the `sarga_inventory` table and assumes your schema includes `reserved_quantity`. In production, prefer running the script against a staging/test database.
- If your deployment uses branch-level stock (`sarga_branch_stock`) or additional business rules, adapt the test accordingly.

If you want, I can add an npm script to `server/package.json` to run this test easily. 