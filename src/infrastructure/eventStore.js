const db = require('./db');
const { v4: uuidv4 } = require('uuid');

class EventStore {
    async getSnapshot(aggregateId) {
        const res = await db.query(
            'SELECT * FROM snapshots WHERE aggregate_id = $1',
            [aggregateId]
        );
        return res.rows[0] || null;
    }

    async getEvents(aggregateId, sinceEventNumber = 0) {
        const res = await db.query(
            'SELECT * FROM events WHERE aggregate_id = $1 AND event_number > $2 ORDER BY event_number ASC',
            [aggregateId, sinceEventNumber]
        );
        return res.rows;
    }

    async saveEvents(events, client = null) {
        const target = client || db;
        for (const event of events) {
            await target.query(
                `INSERT INTO events (event_id, aggregate_id, aggregate_type, event_type, event_data, event_number, timestamp, version)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [
                    event.event_id,
                    event.aggregate_id,
                    event.aggregate_type,
                    event.event_type,
                    event.event_data,
                    event.event_number,
                    event.timestamp,
                    event.version
                ]
            );
        }
    }

    async saveSnapshot(aggregateId, snapshotData, lastEventNumber, client = null) {
        const target = client || db;
        const snapshotId = uuidv4();
        await target.query(
            `INSERT INTO snapshots (snapshot_id, aggregate_id, snapshot_data, last_event_number, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (aggregate_id) DO UPDATE SET
         snapshot_data = EXCLUDED.snapshot_data,
         last_event_number = EXCLUDED.last_event_number,
         created_at = EXCLUDED.created_at`,
            [snapshotId, aggregateId, snapshotData, lastEventNumber]
        );
    }

    async getAllEvents(sinceGlobalId = 0) {
        // For simplicity, we use the timestamp or a serial id if we had one.
        // Since we don't have a global sequence in the schema provided, 
        // we'll rely on the default order of insertion or add a serial column if needed.
        // However, the requirement is to use event_number per aggregate.
        // For a global rebuild, we can just get all events ordered by timestamp.
        const res = await db.query('SELECT * FROM events ORDER BY timestamp ASC, event_number ASC');
        return res.rows;
    }
}

module.exports = new EventStore();
