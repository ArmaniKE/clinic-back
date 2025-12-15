import pkg from "pg";
import dotenv from "dotenv";

dotenv.config();
const { Pool } = pkg;

let pool;

if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
} else {
  pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASS,
    port: 5432,
    ssl: false,
  });
}

pool.on("connect", () => {
  console.log("Connected to PostgreSQL");
});

pool.on("error", (err) => {
  console.error("PostgreSQL error:", err);
  process.exit(1);
});

export default pool;
