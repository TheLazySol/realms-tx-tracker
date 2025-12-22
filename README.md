# DAO Reimbursement Tracker

Track transaction fees paid by a wallet for a specific Solana DAO/Realm. This tool helps you calculate how much SOL was spent on proposing, voting, and commenting within a Realms governance system.

## Features

- Track votes casted and associated fees
- Track proposals created and associated fees
- Track comments posted and associated fees
- Generate detailed CSV reports
- Filter transactions by date range
- Display summary in console

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd dao-reimbursement-tracker

# Install dependencies
pnpm install
```

## Configuration

### 1. Set up RPC URL

Copy `.env.example` to `.env` and add your Solana RPC URL:

```bash
cp .env.example .env
```

Edit `.env`:
```
RPC_URL=your_rpc_url_here
```

### 2. Configure tracking parameters

Edit `config.json` with your tracking parameters:

```json
{
  "realm_id": "5PP7vKjJyLw1MR55LoexRsCj3CpZj9MdD6aNXRrvxG42",
  "wallet_address": "3zxtSkehQA7Dtknwkt95FMnp4h4MDWYHM1epj9xeRsof",
  "start_date": "01-01-2025",
  "end_date": ""
}
```

| Parameter | Description |
|-----------|-------------|
| `realm_id` | The public key of the DAO/Realm |
| `wallet_address` | The wallet address to track |
| `start_date` | Start date in MM-DD-YYYY format |
| `end_date` | End date in MM-DD-YYYY format (leave empty for current date) |

## Usage

```bash
# Build and run
pnpm start

# Or run in development mode
pnpm dev
```

## Output

### Console Summary

```
═══════════════════════════════════════════════════════
  Transaction Fee Summary
═══════════════════════════════════════════════════════

  Votes Casted: 15 | 0.000075000 SOL paid in tx fees
  Proposals Created: 3 | 0.000015000 SOL paid in tx fees
  Comments Posted: 8 | 0.000040000 SOL paid in tx fees

───────────────────────────────────────────────────────
  Total DAO Interactions: 26 | Total Paid: 0.000130000 SOL in tx fees
───────────────────────────────────────────────────────
```

### CSV Report

A CSV file named `[wallet_address].csv` is generated with:

- Transaction Signature
- Date/Time
- Block/Slot
- Transaction Type (Vote, Proposal, Comment)
- Transaction Fee (SOL)
- Rent Cost (SOL)
- Total Cost (SOL)

Plus a summary section at the bottom.

## License

MIT

