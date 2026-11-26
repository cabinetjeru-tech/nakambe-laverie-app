process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://dreadroyal:dreadroyal_dev@localhost:5432/dread_royal_test?schema=public';
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-test-secret-0123456789';
process.env.BACKUP_CRON = 'off';
process.env.BACKUP_DIR = '/tmp/dread-royal-test-backups';
process.env.OWNER_USERNAME = 'proprietaire';
process.env.OWNER_PASSWORD = 'Owner2026!';
process.env.THROTTLE_LIMIT = '100000';
process.env.LOGIN_THROTTLE_LIMIT = '10000';
