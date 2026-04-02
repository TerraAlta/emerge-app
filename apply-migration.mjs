import { readFileSync } from "fs";
import { resolve } from "path";
import { config } from "dotenv";

config({ path: resolve(process.cwd(), ".env.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing Supabase env vars");
  process.exit(1);
}

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260402_national_quests_keyword_search.sql"),
  "utf-8"
);

// Send raw SQL to Supabase REST API
const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${serviceRoleKey}`,
    "apikey": serviceRoleKey,
  },
  body: JSON.stringify({ sql }),
});

const result = await response.json();

if (!response.ok) {
  console.error("Error:", result);
  process.exit(1);
}

console.log("✓ Migration applied successfully!");
