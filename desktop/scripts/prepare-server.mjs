// Builds the Next.js app and copies its standalone server into desktop/server,
// which electron-builder ships as a resource. Cross-platform (no shell cp).
import { execSync } from "node:child_process";
import { cpSync, existsSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.resolve(desktop, "..");
const standalone = path.join(root, ".next", "standalone");
const out = path.join(desktop, "server");

if (!process.argv.includes("--skip-build")) {
  execSync("npm run build", { cwd: root, stdio: "inherit" });
}
if (!existsSync(path.join(standalone, "server.js"))) {
  throw new Error(`No standalone server at ${standalone}. Is output: "standalone" set in next.config.ts?`);
}

rmSync(out, { recursive: true, force: true });
// dereference: Turbopack can emit symlinks into node_modules; copy real files
// so the bundle works on every OS and outside this checkout.
cpSync(standalone, out, { recursive: true, dereference: true });
cpSync(path.join(root, ".next", "static"), path.join(out, ".next", "static"), { recursive: true });
if (existsSync(path.join(root, "public"))) {
  cpSync(path.join(root, "public"), path.join(out, "public"), { recursive: true });
}
// sharp is a per-OS native module Next.js only loads for image optimization,
// which the app doesn't use (images.unoptimized). Dropping it keeps the
// bundle pure JS, so a build from any OS runs on every OS.
rmSync(path.join(out, "node_modules", "sharp"), { recursive: true, force: true });
rmSync(path.join(out, "node_modules", "@img"), { recursive: true, force: true });
// Never ship a developer's local data or secrets.
for (const p of [".data", ".env", ".env.local"]) rmSync(path.join(out, p), { recursive: true, force: true });

console.log(`Server ready in ${out}`);
