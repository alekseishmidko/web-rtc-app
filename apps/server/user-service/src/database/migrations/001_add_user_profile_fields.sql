ALTER TABLE users
  ADD COLUMN IF NOT EXISTS birth_day date,
  ADD COLUMN IF NOT EXISTS currency text,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS locale text,
  ADD COLUMN IF NOT EXISTS timezone text,
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS bio text,
  ADD COLUMN IF NOT EXISTS phone_number text,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS users_country_idx ON users(country);
CREATE INDEX IF NOT EXISTS users_currency_idx ON users(currency);
CREATE INDEX IF NOT EXISTS users_deleted_at_idx ON users(deleted_at);
