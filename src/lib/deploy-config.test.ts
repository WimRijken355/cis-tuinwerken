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

  it("compose lets .env choose the Caddyfile and passes APP_LAN_IP to Caddy", () => {
    const compose = read("docker-compose.prod.yml");
    expect(compose).toContain("./${CADDYFILE:-Caddyfile}:/etc/caddy/Caddyfile:ro");
    expect(compose).toContain("APP_LAN_IP: ${APP_LAN_IP:-}");
  });
});
