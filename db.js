
const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'travel_db',
    password: 'travel123',
    port: 5432
});

pool.connect((err, client, release) => {
    if (err) {
        return console.error('Database connection error:', err.message);
    }

    console.log('PostgreSQL connected successfully!');
    release();
});

module.exports = pool;
