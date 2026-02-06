import postgres from 'postgres';

const requiredEnvVars = [
  'POSTGRES_HOST',
  'POSTGRES_USER',
  'POSTGRES_PASSWORD',
  'POSTGRES_DB',
  'POSTGRES_PORT',
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}

const sql = postgres({
  host: process.env.POSTGRES_HOST!,
  port: parseInt(process.env.POSTGRES_PORT!),
  database: process.env.POSTGRES_DB!,
  username: process.env.POSTGRES_USER!,
  password: process.env.POSTGRES_PASSWORD!,
  ssl: 'require',
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
  transform: {
    undefined: null,
  },
  onnotice: () => {},
});

if (typeof window === 'undefined') {
  sql`SELECT 1 as test`
    .then(() => console.log('Database connected'))
    .catch((err) => console.error('Database connection failed:', err));
}

export default sql;
