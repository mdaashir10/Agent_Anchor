// Creates (or updates) the Moss index from policies/policies.json.
// Run once after setting MOSS_PROJECT_ID and MOSS_PROJECT_KEY:  npm run seed
import fs from "node:fs";
import { MossClient } from "@moss-js/moss";

try { process.loadEnvFile?.(); } catch {}

const id = process.env.MOSS_PROJECT_ID;
const key = process.env.MOSS_PROJECT_KEY;
const index = process.env.MOSS_INDEX_NAME || "agent-firewall-policies";
const file = process.env.POLICIES_PATH || "./policies/policies.json";

if (!id || !key) {
  console.error("Set MOSS_PROJECT_ID and MOSS_PROJECT_KEY first.");
  process.exit(1);
}

const docs = JSON.parse(fs.readFileSync(file, "utf8")).map((p) => ({ id: p.id, text: p.text }));
const client = new MossClient(id, key);

try {
  await client.createIndex(index, docs);
  console.log(`Created index "${index}" with ${docs.length} policies.`);
} catch (e) {
  console.log(`createIndex failed (${e.message}); trying addDocs with upsert...`);
  await client.addDocs(index, docs, { upsert: true });
  console.log(`Upserted ${docs.length} policies into "${index}".`);
}
