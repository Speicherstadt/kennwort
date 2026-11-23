/**
 * The installation files in docker/ (K-703) against the code they install: Caddy's headers against
 * the one table of security headers (packages/core, P-16), every setting against config.ts, the
 * image and the Quadlet units against Compose. Docker, Caddy and Podman are not needed: the files
 * are read as text, YAML and INI. The release workflow builds the image and validates the Caddyfiles
 * with Caddy itself.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { appHeaders } from "@kennwort/core/headers";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..", "..", "..", "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const withoutComments = (text: string) =>
  text
    .split("\n")
    .filter((line) => !line.trim().startsWith("#"))
    .join("\n");

/** Every setting config.ts reads */
const settings = () => [
  ...new Set(
    [...read("apps/server/src/config.ts").matchAll(/\b(KENNWORT_[A-Z_]+):/g)].map((m) => m[1]),
  ),
];

/** The name/value pairs of a Caddy `header` block, names in lower case; `-Name` deletes */
const headerBlock = (caddyfile: string) => {
  const block = /^\t\theader \{\n([\s\S]*?)\n\t\t\}/m.exec(caddyfile)?.[1] ?? "";
  const set: Record<string, string> = {};
  const removed: string[] = [];
  for (const line of block.split("\n").map((l) => l.trim())) {
    if (line.startsWith("-")) removed.push(line.slice(1).toLowerCase());
    const pair = /^([A-Za-z-]+) "(.*)"$/.exec(line);
    if (pair?.[1] && pair[2] !== undefined) set[pair[1].toLowerCase()] = pair[2];
  }
  return { set, removed };
};

describe("Caddyfile (Caddy in front of the server)", () => {
  const caddyfile = withoutComments(read("docker/Caddyfile"));

  it("passes everything to the server and sets no header of its own", () => {
    expect(caddyfile).toContain("reverse_proxy kennwort:8100");
    expect(caddyfile).not.toMatch(/\bheader\b/);
    expect(caddyfile.trim().split("\n")[0]).toBe("{$KENNWORT_DOMAIN} {");
  });
});

describe("Caddyfile.static (Caddy serves the web build)", () => {
  const caddyfile = withoutComments(read("docker/Caddyfile.static"));

  it("sends exactly the app's headers behind https, as the server would", () => {
    const { set, removed } = headerBlock(caddyfile);
    expect(set).toEqual(appHeaders({ secure: true }));
    expect(removed).toEqual(["server"]);
  });

  it("never weakens the policy: no unsafe-inline, no eval, nothing but 'self'", () => {
    const policy = headerBlock(caddyfile).set["content-security-policy"] ?? "";
    expect(policy).not.toMatch(/unsafe|data:|blob:|\*|https?:/);
    expect(policy).toContain("default-src 'none'");
    expect(policy).toContain("frame-ancestors 'none'");
  });

  it("sets headers in no other place than the one block and the cache and type rules", () => {
    const others = caddyfile
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("header ") && line !== "header {");
    expect(others).toEqual([
      'header @assets Cache-Control "public, max-age=31536000, immutable"',
      'header @other Cache-Control "no-cache"',
      'header @manifest Content-Type "application/manifest+json"',
      'header @signature Content-Type "text/plain; charset=utf-8"',
    ]);
  });

  it("passes the server's own paths on, which keep the sandbox policy the server sets", () => {
    expect(caddyfile).toContain("@server path /api /api/* /auth /auth/* /health");
    expect(caddyfile).toMatch(/handle @server \{\n\t\treverse_proxy kennwort:8100\n\t\}/);
  });

  it("serves no dotfile and index.html for every page without a file extension", () => {
    expect(caddyfile).toContain("respond @hidden 404");
    expect(caddyfile).toContain("rewrite @page /index.html");
  });
});

describe("compose.yaml", () => {
  const compose = Bun.YAML.parse(read("docker/compose.yaml")) as {
    services: Record<string, Record<string, unknown>>;
    volumes: Record<string, unknown>;
  };
  const server = compose.services.kennwort ?? {};

  it("runs the image read-only, without capabilities, with the database in a volume", () => {
    // Compose fills in the version from .env, latest without one
    expect(server.image).toBe(`ghcr.io/speicherstadt/kennwort:${"$"}{KENNWORT_VERSION:-latest}`);
    expect(server.read_only).toBe(true);
    expect(server.cap_drop).toEqual(["ALL"]);
    expect(server.security_opt).toEqual(["no-new-privileges:true"]);
    expect(server.volumes).toEqual(["kennwort-data:/data"]);
    expect(server.ports).toBeUndefined();
    expect(Object.keys(compose.volumes)).toContain("kennwort-data");
  });

  it("sets only settings config.ts knows", () => {
    const known = settings();
    for (const name of Object.keys(server.environment as object)) expect(known).toContain(name);
  });

  it("puts Caddy in front with the Caddyfile and waits until the server is healthy", () => {
    const caddy = compose.services.caddy ?? {};
    expect(caddy.volumes).toContain("./Caddyfile:/etc/caddy/Caddyfile:ro");
    expect(caddy.depends_on).toEqual({ kennwort: { condition: "service_healthy" } });
    expect(caddy.ports).toEqual(["80:80", "443:443", "443:443/udp"]);
  });
});

describe("Dockerfile", () => {
  const dockerfile = read("docker/Dockerfile");

  it("builds with the Bun version of package.json", () => {
    const pkg = JSON.parse(read("package.json")) as { packageManager: string };
    expect(dockerfile).toContain(`ARG BUN_VERSION=${pkg.packageManager.replace("bun@", "")}`);
  });

  it("runs as an unprivileged user without a shell, with a healthcheck on /health", () => {
    expect(dockerfile).toContain("FROM gcr.io/distroless/cc-debian12:nonroot");
    expect(dockerfile).toContain("USER 65532:65532");
    expect(dockerfile).toContain('CMD ["/app/kennwort-server", "health"]');
    expect(dockerfile).toContain('VOLUME ["/data"]');
  });

  it("sets only settings config.ts knows, the web build among them", () => {
    const env = /ENV (KENNWORT_[\s\S]*?)\nUSER/.exec(dockerfile)?.[1] ?? "";
    const names = [...env.matchAll(/(KENNWORT_[A-Z_]+)=/g)].map((m) => m[1]);
    expect(names).toEqual(["KENNWORT_PORT", "KENNWORT_DATABASE", "KENNWORT_WEB_ROOT"]);
    for (const name of names) expect(settings()).toContain(name);
  });
});

/** An INI file as Quadlet reads it: sections of keys, a key given twice keeps every value */
const ini = (text: string) => {
  const sections: Record<string, Record<string, string[]>> = {};
  let current: Record<string, string[]> = {};
  for (const line of withoutComments(text)
    .split("\n")
    .map((l) => l.trim())) {
    const section = /^\[(\w+)\]$/.exec(line)?.[1];
    if (section) sections[section] = current = {};
    const pair = /^(\w+)=(.*)$/.exec(line);
    if (pair?.[1] && pair[2] !== undefined)
      current[pair[1]] = [...(current[pair[1]] ?? []), pair[2]];
  }
  return sections;
};

describe("Quadlet units", () => {
  const dir = "docker/quadlet";
  const units = Object.fromEntries(
    readdirSync(join(root, dir)).map((file) => [file, ini(read(`${dir}/${file}`))]),
  );
  const server = units["kennwort.container"]?.Container ?? {};

  it("run the same image as Compose, read-only, without capabilities, with the healthcheck", () => {
    expect(server.Image).toEqual(["ghcr.io/speicherstadt/kennwort:latest"]);
    expect(server.ReadOnly).toEqual(["true"]);
    expect(server.DropCapability).toEqual(["all"]);
    expect(server.NoNewPrivileges).toEqual(["true"]);
    expect(server.HealthCmd).toEqual(["/app/kennwort-server health"]);
    expect(server.Volume).toEqual(["kennwort-data.volume:/data"]);
    expect(server.PublishPort).toBeUndefined();
  });

  it("refer only to networks and volumes this folder defines", () => {
    for (const unit of ["kennwort.container", "kennwort-caddy.container"]) {
      const container = units[unit]?.Container ?? {};
      for (const reference of [...(container.Network ?? []), ...(container.Volume ?? [])]) {
        const name = reference.split(":")[0] ?? "";
        if (name.endsWith(".network") || name.endsWith(".volume"))
          expect(Object.keys(units)).toContain(name);
      }
    }
  });

  it("give Caddy the same Caddyfile and start it after the server", () => {
    const caddy = units["kennwort-caddy.container"] ?? {};
    expect(caddy.Container?.Volume).toContain("/etc/kennwort/Caddyfile:/etc/caddy/Caddyfile:ro,Z");
    expect(caddy.Unit?.Requires).toEqual(["kennwort.service"]);
  });

  it("read settings that config.ts knows, besides the domain for Caddy", () => {
    const example = withoutComments(read("docker/kennwort.env.example"));
    const names = [...example.matchAll(/^(KENNWORT_[A-Z_]+)=/gm)].map((m) => m[1]);
    expect(names).toContain("KENNWORT_AUTH_SECRET");
    for (const name of names.filter((n) => n !== "KENNWORT_DOMAIN"))
      expect(settings()).toContain(name);
  });
});
