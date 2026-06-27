import { copyFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";

const target = process.argv[2] ?? "chrome";
const allowedTargets = new Set(["chrome", "edge", "safari"]);

if (!allowedTargets.has(target)) {
  console.error(`Unsupported target: ${target}`);
  process.exit(2);
}

const root = resolve(import.meta.dirname, "..");
const outDir = resolve(root, "dist", target);
const manifestSource = resolve(root, "manifests", `${target}.json`);
const manifestOutput = resolve(outDir, "manifest.json");

execFileSync("vite", ["build"], {
  cwd: root,
  env: { ...process.env, EXTENSION_TARGET: target },
  stdio: "inherit",
  shell: process.platform === "win32",
});

mkdirSync(outDir, { recursive: true });
copyFileSync(manifestSource, manifestOutput);
