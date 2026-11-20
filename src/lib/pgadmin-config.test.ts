import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Guards the dev pgAdmin setup: the pre-registered server in
// docker/pgadmin/servers.json must match the postgres service in
// docker-compose.yml, otherwise pgAdmin silently fails to connect.
const root = join(__dirname, "..", "..");
const compose = readFileSync(join(root, "docker-compose.yml"), "utf8");
const servers = JSON.parse(readFileSync(join(root, "docker", "pgadmin", "servers.json"), "utf8"));
const server = servers.Servers["1"];

function composeValue(key: string): string {
  const match = compose.match(new RegExp(`^\\s+${key}:\\s*(\\S+)`, "m"));
  if (!match) throw new Error(`${key} not found in docker-compose.yml`);
  return match[1];
}

describe("pgAdmin dev config", () => {
  it("points at the compose postgres service on its internal port", () => {
    expect(server.Host).toBe("postgres");
    expect(server.Port).toBe(5432);
  });

  it("uses the same database, user and password as docker-compose.yml", () => {
    expect(server.MaintenanceDB).toBe(composeValue("POSTGRES_DB"));
    expect(server.Username).toBe(composeValue("POSTGRES_USER"));
    expect(server.PasswordExecCommand).toBe(`echo ${composeValue("POSTGRES_PASSWORD")}`);
  });

  it("is started together with the database by npm run db:up", () => {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    expect(pkg.scripts["db:up"]).toContain("postgres");
    expect(pkg.scripts["db:up"]).toContain("pgadmin");
  });

  it("only exposes pgAdmin on localhost", () => {
    expect(compose).toContain('"127.0.0.1:5050:80"');
  });
});
