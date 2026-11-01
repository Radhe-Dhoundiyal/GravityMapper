CREATE TABLE IF NOT EXISTS gm_experiments (
  id text PRIMARY KEY,
  metadata jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS gm_runs (
  id text PRIMARY KEY,
  experiment_id text REFERENCES gm_experiments(id),
  fingerprint text,
  document jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS gm_uploads (
  sha256 text PRIMARY KEY,
  run_id text NOT NULL REFERENCES gm_runs(id),
  filename text NOT NULL,
  original_base64 text NOT NULL
);
