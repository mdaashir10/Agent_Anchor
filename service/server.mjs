import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { matchRule } from "./src/rules.mjs";
import { loadPolicies, initMoss, mossStatus, queryMoss } from "./src/moss.mjs";

try {
    process.loadEnvFile?.(); // reads ./.env on Node 20.12+/21.7+; ignored if missing
} catch { }

const PORT = Number(process.env.PORT || 3000);
// Bind to loopback by default so the firewall is not exposed to the LAN.
// Docker sets HOST=0.0.0.0 and publishes the port on 127.0.0.1 only.
const HOST = process.env.HOST || "127.0.0.1";
const THRESHOLD = Number(process.env.MOSS_THRESHOLD || 0.6);
const FAIL_MODE = process.env.MOSS_FAIL_MODE === "open" ? "open" : "closed";
const POLICIES_PATH = process.env.POLICIES_PATH || "./policies/policies.json";

const TOOLS = new Set(["bash", "read", "edit", "write"]);
const HARNESSES = new Set(["claude", "opencode"]);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------- events (dashboard feed) ----------
const BUFFER_MAX = 200;
const buffer = [];
const clients = new Set();
let seq = 0;

function redact(s) {
    return s
        .replace(/(authorization:\s*(bearer\s+)?)\S+/gi, "$1[redacted]")
        .replace(/((?:api[_-]?key|token|secret|passw(?:or)?d)\s*[=:]\s*)\S+/gi, "$1[redacted]")
        .replace(/\b(sk|ghp|gho|xox[bp])[-_][A-Za-z0-9_-]{10,}/g, "[redacted]");
}

function summarize(text) {
    return redact(String(text ?? "")).replace(/\s+/g, " ").trim().slice(0, 200);
}

function emit(evt) {
    const full = { id: `evt_${String(++seq).padStart(4, "0")}`, ts: new Date().toISOString(), ...evt };
    buffer.push(full);
    if (buffer.length > BUFFER_MAX) buffer.shift();
    const line = `data: ${JSON.stringify(full)}\n\n`;
    for (const res of clients) res.write(line);
    console.log(
        `${full.id} ${full.harness ?? "?"} ${full.tool ?? "?"} ${full.verdict} ` +
        `${full.matched_policy ?? "-"} ${full.latency_ms ?? "-"}ms  ${full.summary}`
    );
}

// ---------- validation ----------
function validate(b) {
    if (!b || typeof b !== "object") return "body must be a JSON object";
    if (typeof b.harness !== "string" || !HARNESSES.has(b.harness)) return "harness must be one of claude|opencode";
    if (typeof b.tool !== "string" || !TOOLS.has(b.tool)) return "tool must be one of bash|read|edit|write";
    if (typeof b.cwd !== "string") return "cwd must be a string";
    if (b.tool === "bash") {
        if (typeof b.command !== "string" || !b.command) return "command is required when tool is bash";
    } else if (typeof b.file_path !== "string" || !b.file_path) {
        return "file_path is required when tool is read, edit, or write";
    }
    return null;
}

// ---------- decision ----------
async function decide(a) {
    const text = a.tool === "bash" ? a.command : a.file_path;

    const ruleHit = matchRule(a.tool, text);
    if (ruleHit) return { verdict: "block", matched_policy: ruleHit, source: "rule", score: null };

    const moss = mossStatus();
    if (moss.state === "disabled") return { verdict: "allow", matched_policy: null, source: "rule", score: null };

    try {
        if (moss.state === "error") throw new Error(moss.error || "moss failed to load");
        const r = await queryMoss(a.tool, text, THRESHOLD);
        if (r.policy) return { verdict: "block", matched_policy: r.policy, source: "moss", score: r.score };
        return { verdict: "allow", matched_policy: null, source: "moss", score: r.score };
    } catch (e) {
        if (FAIL_MODE === "closed") {
            return { verdict: "block", matched_policy: "moss-unavailable", source: "moss", score: null };
        }
        return { verdict: "allow", matched_policy: null, source: "rule", score: null };
    }
}

// ---------- app ----------
const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "100kb" }));

app.post("/check-action", async (req, res) => {
    const t0 = performance.now();
    const body = req.body;

    const problem = validate(body);
    if (problem) {
        emit({
            harness: body?.harness, tool: body?.tool, summary: `malformed request: ${problem}`,
            verdict: "invalid", matched_policy: null, source: null, score: null, latency_ms: null,
        });
        return res.status(400).json({ error: problem });
    }

    const d = await decide(body);
    const latency_ms = +(performance.now() - t0).toFixed(2);

    emit({
        harness: body.harness, tool: body.tool,
        summary: summarize(body.tool === "bash" ? body.command : body.file_path),
        verdict: d.verdict, matched_policy: d.matched_policy, source: d.source, score: d.score, latency_ms,
    });

    res.json({ verdict: d.verdict, matched_policy: d.matched_policy, latency_ms });
});

app.get("/events", (req, res) => {
    res.set({
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
    });
    res.flushHeaders();
    res.write("retry: 2000\n\n");
    for (const e of buffer) res.write(`data: ${JSON.stringify(e)}\n\n`);
    clients.add(res);
    req.on("close", () => clients.delete(res));
});

setInterval(() => {
    for (const res of clients) res.write(": ping\n\n");
}, 15000).unref();

app.get("/health", (_req, res) => {
    const moss = mossStatus();
    const broken = moss.state === "error" && FAIL_MODE === "closed";
    res.status(broken ? 503 : 200).json({
        ok: !broken,
        moss: moss.state,
        moss_error: moss.error,
        threshold: THRESHOLD,
        fail_mode: FAIL_MODE,
    });
});

app.use(express.static(path.join(__dirname, "public")));

// JSON errors (e.g. malformed request body) instead of Express's HTML page.
app.use((err, _req, res, _next) => {
    const status = err.status || 400;
    emit({
        summary: `malformed request: ${err.message}`, verdict: "invalid",
        matched_policy: null, source: null, score: null, latency_ms: null,
    });
    res.status(status).json({ error: err.message });
});

const n = loadPolicies(POLICIES_PATH);
const state = await initMoss();
app.listen(PORT, HOST, () => {
    console.log(`Agent Firewall service on http://${HOST}:${PORT}`);
    console.log(`policies loaded: ${n} | moss: ${state} | fail mode: ${FAIL_MODE} | threshold: ${THRESHOLD}`);
    if (state === "disabled") console.log("Moss credentials not set: running with regex rules only.");
    if (state === "error") console.log(`Moss failed to load: ${mossStatus().error}`);
});

