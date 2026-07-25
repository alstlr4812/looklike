import pg from "pg";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Render의 무료 Postgres는 SSL이 필요하지만 자체 서명 인증서라 rejectUnauthorized를 꺼야 해요.
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

export async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY,
      image_a_url TEXT NOT NULL,
      image_b_url TEXT NOT NULL,
      image_a_key TEXT NOT NULL,
      image_b_key TEXT NOT NULL,
      label_a TEXT,
      label_b TEXT,
      caption TEXT,
      uploader TEXT,
      delete_token_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'visible',
      report_count INTEGER NOT NULL DEFAULT 0,
      uploader_ip_hash TEXT,
      created_at BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS reports (
      id SERIAL PRIMARY KEY,
      post_id TEXT NOT NULL REFERENCES posts(id),
      reason TEXT,
      reporter_ip_hash TEXT,
      created_at BIGINT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_posts_status_created ON posts(status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_reports_post ON reports(post_id);
  `);
}
