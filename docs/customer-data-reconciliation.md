# Customer-data reconciliation (cafe-review7)

`npm run reconcile:customers` is a read-only dry run by default. It reads the
canonical `customers`, `loyaltyAccounts`, and per-client `stampTransactions` /
`rewardRedemptions` collections and prints a JSON report containing:

- same-business collisions on a normalized Indian mobile number;
- proposed monotonic counter repairs based on valid history rows, including the
  latest valid stamp timestamp needed to seed the server-side cooldown;
- conflicting or incomplete customer/loyalty identities that need manual review.

Same-name records alone are not considered duplicates. The report masks phone
numbers and identifies all candidates as **manual-review-only**. The script
never merges, rewrites, or deletes customer identities, QR tokens, phone-index
rows, activity, stamp, reward, or notification records.

## Run the dry run

Provide Google Application Default Credentials with read access to the existing
`cafe-review7` project. For example, use the organization's normal service
account / ADC workflow; do not put credentials in this repository.

```sh
npm run reconcile:customers
npm run reconcile:customers -- --output /secure/path/customer-report.json
```

## Apply only the counter repairs

Counter writes are separate from duplicate review and are opt-in. Pause staff
stamping and reward redemption while applying so the reviewed ledger snapshot
does not race live writes. The command only updates canonical counters and
aliases by taking the maximum of current values and valid history; it does not
merge or delete customers.

```sh
npm run reconcile:customers -- --apply-counters --confirm-project=cafe-review7
```

Review and securely store the report before applying. Resolve all conflicting
identity entries manually through an authorized, audited process; do not infer
a merge from matching names or phone numbers alone. A phone may be reused by a
different business because the uniqueness key is `(clientId, normalizedPhone)`.
