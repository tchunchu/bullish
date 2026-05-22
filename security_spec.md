# Security Specification - Bullish AI

## Data Invariants
1. A **Report** must always belong to the user who created it.
2. A **StockTrack** must have a valid ticker and a numeric entry price.
3. A **MacroTrack** must have a defined sentiment from the allowed set.
4. Users can only read/write their own data (Ownership Isolation).
5. Timestamps (`timestamp`) must be strictly server-generated.
6. Identity fields (`userId`) must match the authenticated user's UID.

## The "Dirty Dozen" (Attack Scenarios)
1. **Identity Spoofing**: Attempt to create a report with a another user's UID.
2. **State Poisoning**: Inject 1MB of junk data into the `ticker` field.
3. **Price Manipulation**: Set `entryPrice` to a negative number or a string.
4. **Metadata Bypassing**: Update an immutable `createdAt` or `userId` field.
5. **PII Leakage**: Authenticated user attempts to read another user's trade logs.
6. **Phantom Documentation**: Create a document with an ID longer than 128 characters or containing binary symbols.
7. **Orphaned Writes**: Create a `StockTrack` without the `userId` field.
8. **Shadow Field Injection**: Adding an `isAdmin: true` field to a user profile.
9. **Recursive Cost Attack**: Listing all `reports` in the database without a `userId` filter.
10. **Timestamp Forgery**: Providing a client-side date instead of `serverTimestamp()`.
11. **Type Confusion**: Sending an array in place of the `bullCase` string.
12. **Status Skipping**: Modifying a terminal record (if applicable).

## Test Assertions
| Scenario | Action | Data | Expected |
|----------|--------|------|----------|
| Owner Read | get | /reports/123 (owned by auth.uid) | ALLOW |
| Stranger Read | get | /reports/123 (owned by other.uid) | DENY |
| Valid Ticker | create | ticker: "AAPL" | ALLOW |
| Invalid Ticker | create | ticker: "SUPER_LONG_TICKER_NAME_123" | DENY |
| Fake Timestamp | create | timestamp: "2023-01-01" | DENY |
| Real Timestamp | create | timestamp: serverTimestamp() | ALLOW |
