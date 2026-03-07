const db = require('../infrastructure/db');
const eventStore = require('../infrastructure/eventStore');
const projectionManager = require('../infrastructure/projections');
const BankAccount = require('../domain/BankAccount');

class CommandHandler {
    async handle(command) {
        const client = await db.getClient();
        try {
            await client.query('BEGIN');

            let account;
            let newEvent;

            if (command.type === 'CreateAccount') {
                // Business rule: Check if exists
                const existing = await eventStore.getEvents(command.data.accountId);
                if (existing.length > 0) {
                    throw new Error('ACCOUNT_EXISTS');
                }
                newEvent = BankAccount.create(
                    command.data.accountId,
                    command.data.ownerName,
                    command.data.initialBalance,
                    command.data.currency
                );
            } else {
                // Load existing aggregate
                const snapshot = await eventStore.getSnapshot(command.accountId);
                account = new BankAccount(command.accountId);

                let sinceVersion = 0;
                if (snapshot) {
                    account.loadFromSnapshot(snapshot);
                    sinceVersion = snapshot.last_event_number;
                }

                const events = await eventStore.getEvents(command.accountId, sinceVersion);
                for (const e of events) {
                    account.apply(e);
                }

                // Apply command logic
                switch (command.type) {
                    case 'DepositMoney':
                        newEvent = account.deposit(command.data.amount, command.data.description, command.data.transactionId);
                        break;
                    case 'WithdrawMoney':
                        newEvent = account.withdraw(command.data.amount, command.data.description, command.data.transactionId);
                        break;
                    case 'CloseAccount':
                        newEvent = account.close(command.data.reason);
                        break;
                    default:
                        throw new Error('UNKNOWN_COMMAND');
                }
            }

            // Save event
            await eventStore.saveEvents([newEvent], client);

            // Update Projections synchronously as part of transaction
            await projectionManager.handle(newEvent, client);

            // Snapshotting strategy: after every 50 events
            if (newEvent.event_number > 0 && newEvent.event_number % 50 === 0) {
                // Recalculate full state if needed for snapshot
                // We have the aggregate 'account' or we can apply the newEvent to it
                if (account) {
                    account.apply(newEvent);
                } else {
                    // It was CreateAccount, so account is new but version 1
                    account = new BankAccount(newEvent.aggregate_id);
                    account.apply(newEvent);
                }
                await eventStore.saveSnapshot(newEvent.aggregate_id, account.toJSON(), newEvent.event_number, client);
            }

            await client.query('COMMIT');
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    }

    async rebuildProjections() {
        const client = await db.getClient();
        try {
            await client.query('BEGIN');
            await projectionManager.clearAll();
            const events = await eventStore.getAllEvents();
            for (const e of events) {
                await projectionManager.handle(e, client);
            }
            await client.query('COMMIT');
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    }
}

module.exports = new CommandHandler();
