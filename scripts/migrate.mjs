#!/usr/bin/env node
if (!process.env.DATABASE_URL) {
  console.log("[migrate] DATABASE_URL not set — skipping.");
  process.exit(0);
}
process.exit(0);
