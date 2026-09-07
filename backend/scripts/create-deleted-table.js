const { db } = require('../config/database');
(async () => {
  try {
    await db.query('CREATE TABLE IF NOT EXISTS community_deleted (id BIGINT UNSIGNED PRIMARY KEY, deleted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)');
    console.log('TABLE OK');
  } catch (e) {
    console.error('ERR', e.message);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
})();
