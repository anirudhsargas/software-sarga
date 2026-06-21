const TEST_DB_VARS = ['HOST', 'PORT', 'USER', 'PASSWORD', 'NAME', 'SSL'];
for (const v of TEST_DB_VARS) {
  const testVal = process.env[`TEST_DB_${v}`];
  if (testVal) {
    process.env[`DB_${v}`] = testVal;
  }
}

if (!process.env.DB_HOST) {
  process.env.DB_HOST = process.env.TEST_DB_HOST || 'localhost';
  process.env.DB_PORT = process.env.TEST_DB_PORT || '3306';
  process.env.DB_USER = process.env.TEST_DB_USER || 'root';
  process.env.DB_PASSWORD = process.env.TEST_DB_PASSWORD || '';
  process.env.DB_NAME = process.env.TEST_DB_NAME || 'sarga_test';
}

process.env.NODE_ENV = 'test';
process.env.DB_SSL = 'false';
process.env.PGSSLMODE = 'disable';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_key_that_is_at_least_32_chars_long_!X';
process.env.JWT_SECRET_PREVIOUS = process.env.JWT_SECRET_PREVIOUS || '';
process.env.CLOUDINARY_CLOUD_NAME = '';
process.env.CLOUDINARY_API_KEY = '';
process.env.CLOUDINARY_API_SECRET = '';
process.env.ML_SERVICE_URL = 'http://127.0.0.1:5001';
