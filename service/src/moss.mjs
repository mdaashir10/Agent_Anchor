import fs from "node:fs";

// Moss adapter. Isolated here so the rest of the service never touches the SDK.
//
// Moss flow (per Moss docs): the index is created in the cloud (see
// scripts/seed-moss.mjs), then loadIndex() downloads it into memory. After
// that, query() runs locally in-memory with no network call.
// NOTE: loadIndex() itself needs network + credentials at startup.

const INDEX = process.env.MOSS_INDEX_NAME || "agent-firewall-policies";

let client = null;
let state = "disabled"; // "disabled" | "ready" | "error"
let lastError = null;
let policies = new Map();

export function loadPolicies(path) {
  const list = JSON.parse(fs.readFileSync(path, "utf8"));
  policies = new Map(list.map((p) => [p.id, p]));
  return list.length;
}

export async function initMoss() {
  const id = process.env.MOSS_PROJECT_ID;
  const key = process.env.MOSS_PROJECT_KEY;
  if (!id || !key) {
    state = "disabled";
    return state;
  }
  try {
    const { MossClient } = await import("@moss-js/moss");
    client = new MossClient(id, key);
    await client.loadIndex(INDEX);
    state = "ready";
    lastError = null;
  } catch (e) {
    state = "error";
    lastError = e.message;
  }
  return state;
}

export function mossStatus() {
  return { state, error: lastError, index: INDEX };
}

// Returns { policy, score } where policy is the id of the first deny policy
// that applies to this tool and scores at or above the threshold (else null).
// score is the best score seen, for the dashboard and for threshold tuning.
export async function queryMoss(tool, text, threshold) {
  const results = await client.query(INDEX, text, { topK: 5 });
  const docs = results?.docs ?? [];
  let best = null;
  for (const d of docs) {
    if (best === null || d.score > best) best = d.score;
    const rec = policies.get(d.id);
    if (
      rec &&
      rec.action === "deny" &&
      rec.applies_to.includes(tool) &&
      d.score >= threshold
    ) {
      return { policy: rec.id, score: d.score };
    }
  }
  return { policy: null, score: best };
}
