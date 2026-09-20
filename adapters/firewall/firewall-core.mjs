const URL = process.env.FIREWALL_URL || "http://localhost:3000/check-action";
const TIMEOUT_MS = Number(process.env.FIREWALL_TIMEOUT_MS || 2000);

// Canonical action contract (frozen):
// { harness, tool, command?, file_path?, cwd, session_id? }
// tool is one of: "bash" | "read" | "edit" | "write"
//
// Returns { block: boolean, reason?: string }.
// Any failure (bad input, network error, timeout, non-200) => block.
export async function decide(action) {
    try {
        if (!action || typeof action.tool !== "string" || !action.tool) {
            throw new Error("malformed action from shim");
        }

        const res = await fetch(URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(action),
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!res.ok) throw new Error(`service returned ${res.status}`);

        const v = await res.json();
        if (v.verdict === "block") {
            return {
                block: true,
                reason: `Blocked by Agent Firewall: ${v.matched_policy ?? "policy match"}`,
            };
        }
        if (v.verdict === "allow") return { block: false };

        throw new Error("unrecognized verdict from service");
    } catch (e) {
        return {
            block: true,
            reason: `Firewall unreachable, failing closed: ${e.message}`,
        };
    }
}
