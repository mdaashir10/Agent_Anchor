import { decide } from "./firewall-core.mjs";

const GUARDED = new Set(["bash", "read", "edit", "write"]);

export const AgentFirewall = async ({ directory }) => ({
    "tool.execute.before": async (input, output) => {
        if (!GUARDED.has(input.tool)) return;

        const a = output.args ?? {};
        const d = await decide({
            harness: "opencode",
            tool: input.tool,
            command: a.command,
            file_path: a.filePath ?? a.file_path,
            cwd: directory,
        });

        if (d.block) throw new Error(d.reason);
    },
});

