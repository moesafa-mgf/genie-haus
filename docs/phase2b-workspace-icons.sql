-- Optional: add icon_url to workspaces for custom icons/favicons
ALTER TABLE IF EXISTS workspaces
  ADD COLUMN IF NOT EXISTS icon_url TEXT;
