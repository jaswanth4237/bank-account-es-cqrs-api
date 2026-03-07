const express = require('express');
require('express-async-errors');
const bodyParser = require('body-parser');
const commandHandler = require('./application/commandHandler');
const queryHandler = require('./application/queryHandler');
const projectionManager = require('./infrastructure/projections');

const app = express();
const port = process.env.API_PORT || 8080;

app.use(bodyParser.json());

// Command Endpoints
app.post('/api/accounts', async (req, res) => {
    const { accountId, ownerName, initialBalance, currency } = req.body;
    try {
        await commandHandler.handle({
            type: 'CreateAccount',
            data: { accountId, ownerName, initialBalance, currency }
        });
        res.status(202).send();
    } catch (err) {
        if (err.message === 'ACCOUNT_EXISTS') {
            return res.status(409).json({ error: 'Account already exists' });
        }
        res.status(400).json({ error: err.message });
    }
});

app.post('/api/accounts/:accountId/deposit', async (req, res) => {
    const { accountId } = req.params;
    const { amount, description, transactionId } = req.body;
    try {
        await commandHandler.handle({
            type: 'DepositMoney',
            accountId,
            data: { amount, description, transactionId }
        });
        res.status(202).send();
    } catch (err) {
        if (err.message === 'ACCOUNT_CLOSED') {
            return res.status(409).json({ error: 'Account is closed' });
        }
        // Handle 404 would require checking if events exist, but usually aggregate loader throws if not found
        res.status(400).json({ error: err.message });
    }
});

app.post('/api/accounts/:accountId/withdraw', async (req, res) => {
    const { accountId } = req.params;
    const { amount, description, transactionId } = req.body;
    try {
        await commandHandler.handle({
            type: 'WithdrawMoney',
            accountId,
            data: { amount, description, transactionId }
        });
        res.status(202).send();
    } catch (err) {
        if (err.message === 'ACCOUNT_CLOSED' || err.message === 'INSUFFICIENT_FUNDS') {
            return res.status(409).json({ error: err.message });
        }
        res.status(400).json({ error: err.message });
    }
});

app.post('/api/accounts/:accountId/close', async (req, res) => {
    const { accountId } = req.params;
    const { reason } = req.body;
    try {
        await commandHandler.handle({
            type: 'CloseAccount',
            accountId,
            data: { reason }
        });
        res.status(202).send();
    } catch (err) {
        if (err.message === 'BALANCE_NOT_ZERO') {
            return res.status(409).json({ error: 'Account balance must be zero' });
        }
        res.status(400).json({ error: err.message });
    }
});

// Query Endpoints
app.get('/api/accounts/:accountId', async (req, res) => {
    const account = await queryHandler.getAccount(req.params.accountId);
    if (!account) return res.status(404).json({ error: 'Account not found' });
    res.json(account);
});

app.get('/api/accounts/:accountId/events', async (req, res) => {
    const events = await queryHandler.getEvents(req.params.accountId);
    if (events.length === 0) return res.status(404).json({ error: 'Account not found' });
    res.json(events);
});

app.get('/api/accounts/:accountId/balance-at/:timestamp', async (req, res) => {
    const timestamp = decodeURIComponent(req.params.timestamp);
    const result = await queryHandler.getBalanceAt(req.params.accountId, timestamp);
    if (!result) return res.status(404).json({ error: 'Account not found or no events before this timestamp' });
    res.json(result);
});

app.get('/api/accounts/:accountId/transactions', async (req, res) => {
    const { page, pageSize } = req.query;
    const result = await queryHandler.getTransactions(req.params.accountId, page, pageSize);
    res.json(result);
});

// Projection Endpoints
app.post('/api/projections/rebuild', async (req, res) => {
    // Rebuild in background
    commandHandler.rebuildProjections().catch(err => console.error('Rebuild failed', err));
    res.status(202).json({ message: 'Projection rebuild initiated.' });
});

app.get('/api/projections/status', async (req, res) => {
    const status = await projectionManager.getStatus();
    res.json(status);
});

// Health Check
app.get('/health', (req, res) => {
    res.json({ status: 'OK' });
});

// Global Error Handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Internal Server Error', details: err.message });
});

app.listen(port, () => {
    console.log(`API listening at http://localhost:${port}`);
});
