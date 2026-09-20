// Deterministic rules. These run BEFORE Moss so the demo cases never depend on
// a similarity threshold. Each rule id should also exist in policies/policies.json
// so Moss can catch rephrasings of the same idea.
//
// applies_to uses the four canonical tool names: bash | read | edit | write

const SECRET_FILE =
  /(^|[\/\s"'=])\.env(?!\.(example|sample|template)\b)(\.[\w.-]+)?($|[\s"'\/;|&])/;
const SECRET_KEYS =
  /(^|[\/\s"'])(id_rsa|id_ed25519)(\.pub)?($|[\s"'])|\.pem\b|\.aws\/credentials|\.ssh\//;
const SELF_TAMPER =
  /(^|[\/\s"'])\.firewall($|[\/\s"'])|\.claude\/settings(\.local)?\.json|\.opencode\/plugins?\//;

export const RULES = [
  {
    id: "no-destructive-rm",
    applies_to: ["bash"],
    test: (t) => /\brm\b[^|;&\n]*\s(-[a-zA-Z]*[rR][a-zA-Z]*|--recursive)\b/.test(t),
  },
  {
    id: "no-secret-files",
    applies_to: ["bash", "read", "edit", "write"],
    test: (t) => SECRET_FILE.test(t) || SECRET_KEYS.test(t),
  },
  {
    id: "no-force-push",
    applies_to: ["bash"],
    test: (t) => /\bgit\s+push\b[^|;&\n]*(\s--force\b|\s-f\b)/.test(t),
  },
  {
    id: "no-sql-drop",
    applies_to: ["bash"],
    test: (t) => /\b(drop\s+(table|database|schema)|truncate\s+table)\b/i.test(t),
  },
  {
    id: "no-pipe-to-shell",
    applies_to: ["bash"],
    test: (t) => /\b(curl|wget)\b[^|\n]*\|\s*(sudo\s+)?(ba|z)?sh\b/.test(t),
  },
  {
    id: "no-disk-wipe",
    applies_to: ["bash"],
    test: (t) => /\bmkfs(\.\w+)?\b|\bdd\s+if=\S+\s+of=\/dev\//.test(t),
  },
  {
    id: "no-self-tamper",
    applies_to: ["bash", "edit", "write"],
    test: (t) => SELF_TAMPER.test(t),
  },
];

export function matchRule(tool, text) {
  for (const r of RULES) {
    if (r.applies_to.includes(tool) && r.test(text)) return r.id;
  }
  return null;
}
