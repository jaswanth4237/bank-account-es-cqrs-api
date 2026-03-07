const db = require('./db');

class ProjectionManager {
    async handle(event, client = null) {
        const target = client || db;

        switch (event.event_type) {
            case 'AccountCreated':
                await this.handleAccountCreated(event, target);
                break;
            case 'MoneyDeposited':
                await this.handleMoneyDeposited(event, target);
                break;
            case 'MoneyWithdrawn':
                await this.handleMoneyWithdrawn(event, target);
                break;
            case 'AccountClosed':
                await this.handleAccountClosed(event, target);
                break;
        }

        // Update internal tracker for status endpoint
        // In a real system, we might have multiple projection handlers. 
        // Here we'll just update a common tracker for simplicity or individual ones as required.
        // The requirement says we need status for "AccountSummaries" and "TransactionHistory".
        await target.query(
            `UPDATE projection_status SET last_processed_event_number_global = last_processed_event_number_global + 1
       WHERE projection_name IN ('AccountSummaries', 'TransactionHistory')`,
            []
        );
    }

    async handleAccountCreated(event, target) {
        const { ownerName, initialBalance, currency } = event.event_data;
        await target.query(
            `INSERT INTO account_summaries (account_id, owner_name, balance, currency, status, version)
       VALUES ($1, $2, $3, $4, 'OPEN', 1)
       ON CONFLICT (account_id) DO NOTHING`,
            [event.aggregate_id, ownerName, initialBalance, currency]
        );

        // Also add to transaction history? 
        // Usually initialBalance might represent a deposit if it's > 0.
        if (parseFloat(initialBalance) > 0) {
            await target.query(
                `INSERT INTO transaction_history (transaction_id, account_id, type, amount, description, timestamp)
         VALUES ($1, $2, 'DEPOSIT', $3, 'Account Opened', $4)`,
                ['INIT-' + event.aggregate_id, event.aggregate_id, initialBalance, event.timestamp]
            );
        }
    }

    async handleMoneyDeposited(event, target) {
        const { amount, description, transactionId } = event.event_data;
        await target.query(
            `UPDATE account_summaries SET balance = balance + $1, version = $2 WHERE account_id = $3`,
            [amount, event.event_number, event.aggregate_id]
        );

        await target.query(
            `INSERT INTO transaction_history (transaction_id, account_id, type, amount, description, timestamp)
       VALUES ($1, $2, 'DEPOSIT', $3, $4, $5)
       ON CONFLICT (transaction_id) DO NOTHING`,
            [transactionId, event.aggregate_id, amount, description, event.timestamp]
        );
    }

    async handleMoneyWithdrawn(event, target) {
        const { amount, description, transactionId } = event.event_data;
        await target.query(
            `UPDATE account_summaries SET balance = balance - $1, version = $2 WHERE account_id = $3`,
            [amount, event.event_number, event.aggregate_id]
        );

        await target.query(
            `INSERT INTO transaction_history (transaction_id, account_id, type, amount, description, timestamp)
       VALUES ($1, $2, 'WITHDRAWAL', $3, $4, $5)
       ON CONFLICT (transaction_id) DO NOTHING`,
            [transactionId, event.aggregate_id, amount, description, event.timestamp]
        );
    }

    async handleAccountClosed(event, target) {
        await target.query(
            `UPDATE account_summaries SET status = 'CLOSED', version = $1 WHERE account_id = $2`,
            [event.event_number, event.aggregate_id]
        );
    }

    async clearAll() {
        await db.query('DELETE FROM account_summaries');
        await db.query('DELETE FROM transaction_history');
        await db.query('UPDATE projection_status SET last_processed_event_number_global = 0');
    }

    async getStatus() {
        const res = await db.query('SELECT * FROM projection_status');
        const totalEvents = await db.query('SELECT COUNT(*) FROM events');
        const total = parseInt(totalEvents.rows[0].count);

        return {
            totalEventsInStore: total,
            projections: res.rows.map(row => ({
                name: row.projection_name,
                lastProcessedEventNumberGlobal: parseInt(row.last_processed_event_number_global),
                lag: Math.max(0, total - parseInt(row.last_processed_event_number_global))
            }))
        };
    }
}

module.exports = new ProjectionManager();
