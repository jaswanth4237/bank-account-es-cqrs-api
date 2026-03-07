const { v4: uuidv4 } = require('uuid');

class BankAccount {
  constructor(id) {
    this.id = id;
    this.ownerName = '';
    this.balance = 0;
    this.currency = 'USD';
    this.status = 'OPEN';
    this.version = 0; // last processed event number
  }

  // State Reconstruction
  apply(event) {
    switch (event.event_type) {
      case 'AccountCreated':
        this.ownerName = event.event_data.ownerName;
        this.balance = parseFloat(event.event_data.initialBalance);
        this.currency = event.event_data.currency;
        this.status = 'OPEN';
        break;
      case 'MoneyDeposited':
        this.balance += parseFloat(event.event_data.amount);
        break;
      case 'MoneyWithdrawn':
        this.balance -= parseFloat(event.event_data.amount);
        break;
      case 'AccountClosed':
        this.status = 'CLOSED';
        break;
    }
    this.version = event.event_number;
  }

  // Load from snapshot
  loadFromSnapshot(snapshot) {
    this.ownerName = snapshot.snapshot_data.ownerName;
    this.balance = parseFloat(snapshot.snapshot_data.balance);
    this.currency = snapshot.snapshot_data.currency;
    this.status = snapshot.snapshot_data.status;
    this.version = snapshot.last_event_number;
  }

  // Business Logic / Command Validation
  static create(id, ownerName, initialBalance, currency) {
    if (!id || !ownerName || initialBalance < 0) {
      throw new Error('Invalid account creation parameters');
    }
    return {
      event_id: uuidv4(),
      aggregate_id: id,
      aggregate_type: 'BankAccount',
      event_type: 'AccountCreated',
      event_data: { ownerName, initialBalance, currency },
      event_number: 1,
      timestamp: new Date().toISOString(),
      version: 1
    };
  }

  deposit(amount, description, transactionId) {
    if (this.status === 'CLOSED') {
      throw new Error('ACCOUNT_CLOSED');
    }
    if (amount <= 0) {
      throw new Error('INVALID_AMOUNT');
    }
    return {
      event_id: uuidv4(),
      aggregate_id: this.id,
      aggregate_type: 'BankAccount',
      event_type: 'MoneyDeposited',
      event_data: { amount, description, transactionId },
      event_number: this.version + 1,
      timestamp: new Date().toISOString(),
      version: 1
    };
  }

  withdraw(amount, description, transactionId) {
    if (this.status === 'CLOSED') {
      throw new Error('ACCOUNT_CLOSED');
    }
    if (amount <= 0) {
      throw new Error('INVALID_AMOUNT');
    }
    if (this.balance - amount < 0) {
      throw new Error('INSUFFICIENT_FUNDS');
    }
    return {
      event_id: uuidv4(),
      aggregate_id: this.id,
      aggregate_type: 'BankAccount',
      event_type: 'MoneyWithdrawn',
      event_data: { amount, description, transactionId },
      event_number: this.version + 1,
      timestamp: new Date().toISOString(),
      version: 1
    };
  }

  close(reason) {
    if (this.balance !== 0) {
      throw new Error('BALANCE_NOT_ZERO');
    }
    return {
      event_id: uuidv4(),
      aggregate_id: this.id,
      aggregate_type: 'BankAccount',
      event_type: 'AccountClosed',
      event_data: { reason },
      event_number: this.version + 1,
      timestamp: new Date().toISOString(),
      version: 1
    };
  }

  toJSON() {
    return {
      ownerName: this.ownerName,
      balance: this.balance,
      currency: this.currency,
      status: this.status
    };
  }
}

module.exports = BankAccount;
