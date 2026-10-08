# Bank Account Management API (ES/CQRS)

This project implements  fully functional bank account management system using **Event Sourcing (ES)** and **Command Query Responsibility Segregation (CQRS)**.

## Architecture

- **Event Sourcing**: Every state change is stored as an immutable event. The `events` table is the source of truth.
- **CQRS**: Separates the write model (commands producing events) from the read model (projections for fast queries).
- **Snapshotting**: To optimize reconstruction, a snapshot is created after every 50 events.
- **Projections**: Read models (`account_summaries`, `transaction_history`) are updated synchronously for high accuracy and consistency in this demonstration.

## Getting Started

### Prerequisites

- Docker and Docker Compose

### Running the Project

1.  Copy `.env.example` to `.env`.
2.  Run `docker-compose up --build`.

The API will be accessible at `http://localhost:8080`.

## API Endpoints

### Command API (Writes)

- `POST /api/accounts`: Create a new account.
- `POST /api/accounts/:accountId/deposit`: Deposit money.
- `POST /api/accounts/:accountId/withdraw`: Withdraw money.
- `POST /api/accounts/:accountId/close`: Close an account (requires zero balance).

### Query API (Reads)

- `GET /api/accounts/:accountId`: Get current account state.
- `GET /api/accounts/:accountId/events`: Get full event history.
- `GET /api/accounts/:accountId/transactions`: Get paginated transaction history.
- `GET /api/accounts/:accountId/balance-at/:timestamp`: Reconstruct balance at a point in time.

### Maintenance API

- `POST /api/projections/rebuild`: Trigger a full rebuild of read models from events.
- `GET /api/projections/status`: Check projection lag and progress.

## Implementation Details

- **Database**: PostgreSQL 15
- **Backend**: Node.js/Express
- **Snapshotting**: Triggered automatically after every 50 events.
- **Consistency**: The current implementation uses synchronous projection updates within the same transaction for immediate read-after-write consistency.
