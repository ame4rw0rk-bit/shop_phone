const { Sequelize } = require('sequelize');
const config = require('./env');

const sequelize = new Sequelize(config.db.name, config.db.user, config.db.pass, {
  host: config.db.host,
  port: config.db.port,
  dialect: 'mysql',
  logging: config.isProduction ? false : (msg) => console.log('[sql]', msg),
  pool: config.db.pool,
  retry: { max: 3 },
  dialectOptions: {
    connectTimeout: 20_000,
    charset: 'utf8mb4',
    ...(config.db.ssl ? { ssl: { rejectUnauthorized: true } } : {})
  },
  define: {
    charset: 'utf8mb4',
    collate: 'utf8mb4_unicode_ci'
  },
  timezone: config.db.timezone || '+00:00'
});

module.exports = sequelize;
