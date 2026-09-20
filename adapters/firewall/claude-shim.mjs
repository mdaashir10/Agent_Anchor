import { decide } from "./firewall-core.mjs";

const GUARDED = new Set(["bash", "read", "edit", "write"]);

try {
    let raw = "";
    for await (const chunk of process.stdin) raw += chunk;
    const e = JSON.parse(raw);

    const tool = String(e.tool_name).toLowerCase();
    if (!GUARDED.has(tool)) process.exit(0);

    const d = await decide({
        harness: "claude",
        tool,
        command: e.tool_input?.command,
        file_path: e.tool_input?.file_path,
        cwd: e.cwd,
        session_id: e.session_id,
    });

    if (d.block) {
        console.error(d.reason);
        process.exit(2);
    }
    process.exit(0);
} catch (err) {
    // Any uncaught error must exit 2. Exit 1 would let the tool run (fail open).
    console.error(`Firewall hook error, failing closed: ${err.message}`);
    process.exit(2);
}

