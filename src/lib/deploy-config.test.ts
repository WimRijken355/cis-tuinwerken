import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Guards the Caddy/compose deployment config: the public Caddyfile must keep
// using Let's Encrypt, the internal one must work for both domain and bare IP.
const root = join(__dirname, "..", "..");
const read = (file: string) => readFileSync(join(root, file), "utf8");

describe("deployment config", () => {
  it("production Caddyfile uses automatic (Let's Encrypt) HTTPS, not the internal CA", () => {
    const caddy = read("Caddyfile");
    expect(caddy).toContain("{$APP_DOMAIN} {");
    expect(caddy).not.toMatch(/^\s*tls internal/m);
  });

  it("internal Caddyfile serves domain and LAN IP with the internal CA", () => {
    const caddy = read("Caddyfile.internal");
    expect(caddy).toContain("{$APP_DOMAIN}, {$APP_LAN_IP} {");
    expect(caddy).toMatch(/^\s*tls internal/m);
    // Without default_sni, clients connecting by IP (no SNI) fail the TLS handshake.
    expect(caddy).toMatch(/default_sni \{\$APP_LAN_IP\}/);
  });

  it("update script is safe to run while git pull replaces it", () => {
    const script = read("scripts/update-server.sh");
    expect(script.startsWith("#!/bin/sh\n")).toBe(true); // LF, no CRLF
    expect(script).toContain("set -eu");
    // All work happens in main(), called only at the end of the file.
    expect(script.trimEnd().endsWith('main "$@"\nexit')).toBe(true);
    expect(script).toContain("git pull --ff-only");
    expect(script).toContain('COMPOSE_FILE="docker-compose.prod.yml"');
    // Refuses to run with local edits on the server.
    expect(script).toContain("git status --porcelain --untracked-files=no");
  });

  it("production Postgres is published on loopback only (reachable via SSH tunnel, never the network)", () => {
    const compose = read("docker-compose.prod.yml");
    expect(compose).toContain('- "127.0.0.1:5432:5432"');
    // Any other 5432 mapping (e.g. "5432:5432" or "0.0.0.0:5432:…") would expose the DB.
    const mappings = compose.match(/^\s*-\s*"[^"]*:5432"\s*$/gm) ?? [];
    expect(mappings).toHaveLength(1);
  });

  it("db:tunnel forwards a local loopback port to the server Postgres, matching pgAdmin's tunnel server", () => {
    const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
    expect(pkg.scripts["db:tunnel"]).toContain("-L 127.0.0.1:15432:127.0.0.1:5432");
    const servers = JSON.parse(read("docker/pgadmin/servers.json")) as {
      Servers: Record<string, { Host: string; Port: number }>;
    };
    const tunnel = Object.values(servers.Servers).find((s) => s.Port === 15432);
    expect(tunnel?.Host).toBe("host.docker.internal");
  });

  it("compose lets .env choose the Caddyfile and passes APP_LAN_IP to Caddy", () => {
    const compose = read("docker-compose.prod.yml");
    expect(compose).toContain("./${CADDYFILE:-Caddyfile}:/etc/caddy/Caddyfile:ro");
    expect(compose).toContain("APP_LAN_IP: ${APP_LAN_IP:-}");
  });
});
