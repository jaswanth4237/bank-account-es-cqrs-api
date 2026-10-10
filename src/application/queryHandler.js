const db = require('../infrastructure/db');
const eventStore = require('../infrastructure/eventStore');
const BankAccount = require('../domain/BankAccount');

class QueryHandler {
    async getAccount(accountId) {
        const res = await db.query(
            'SELECT * FROM account_summaries WHERE account_id = $1',
            [accountId]
        );
        if (res.rows.length === 0) return null;
        return {
            accountId: res.rows[0].account_id,
            ownerName: res.rows[0].owner_name,
            balance: parseFloat(res.rows[0].balance),
            currency: res.rows[0].currency,
            status: res.rows[0].status
        };
    }

    async getEvents(accountId) {
        const res = await eventStore.getEvents(accountId);
        return res.map(e => ({
            eventId: e.event_id,
            eventType: e.event_type,
            eventNumber: e.event_number,
            data: e.event_data,
            timestamp: e.timestamp
        }));
    }

    async getBalanceAt(accountId, timestamp) {
        // Reconstruct state up to a point in time.
        const res = await db.query(
            'SELECT * FROM events WHERE aggregate_id = $1 AND timestamp <= $2 ORDER BY event_number ASC',
            [accountId, timestamp]
        );

        if (res.rows.length === 0) return null;

        const account = new BankAccount(accountId);
        for (const e of res.rows) {
            account.apply(e);
        }

        return {
            accountId: account.id,
            balanceAt: account.balance,
            timestamp: timestamp
        };
    }

    async getTransactions(accountId, page = 1, pageSize = 10) {
        const offset = (page - 1) * pageSize;
        const itemsRes = await db.query(
            'SELECT * FROM transaction_history WHERE account_id = $1 ORDER BY timestamp DESC LIMIT $2 OFFSET $3',
            [accountId, pageSize, offset]
        );

        const countRes = await db.query(
            'SELECT COUNT(*) FROM transaction_history WHERE account_id = $1',
            [accountId]
        );

        const totalCount = parseInt(countRes.rows[0].count);
        const totalPages = Math.ceil(totalCount / pageSize);

        return {
            currentPage: parseInt(page),
            pageSize: parseInt(pageSize),
            totalPages: totalPages,
            totalCount: totalCount,
            items: itemsRes.rows.map(row => ({
                transactionId: row.transaction_id,
                type: row.type,
                amount: parseFloat(row.amount),
                description: row.description,
                timestamp: row.timestamp
            }))
        };
    }
}

module.exports = new QueryHandler();
