import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

const root = resolve(import.meta.dirname, "..", "..");
const extensionsRoot = join(root, "extensions");
const base = argValue("--base");
const head = argValue("--head") ?? "HEAD";
const explicitExtensions = argValue("--extensions");

function extensionProjects() {
  return readdirSync(extensionsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const directory = entry.name;
      const packageJsonPath = join(extensionsRoot, directory, "package.json");
      if (!existsSync(packageJsonPath)) {
        return undefined;
      }

      const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
      return {
        browserTargets: Array.isArray(packageJson.browserTargets)
          ? packageJson.browserTargets
          : ["chrome", "edge", "firefox", "safari"],
        directory,
        packageName: packageJson.name,
        version: packageJson.version,
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.directory.localeCompare(right.directory));
}

const projects = extensionProjects();
const byDirectory = new Map(projects.map((project) => [project.directory, project]));
const byPackage = new Map(projects.map((project) => [project.packageName, project]));

function matrix(projectList) {
  return {
    count: projectList.length,
    include: projectList.map((project) => ({
      browserTargets: project.browserTargets,
      directory: project.directory,
      packageName: project.packageName,
      version: project.version,
    })),
  };
}

function parseExplicit(value) {
  if (!value?.trim()) {
    return undefined;
  }

  const selected = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => byDirectory.get(item) ?? byPackage.get(item))
    .filter(Boolean);
  const unique = [...new Map(selected.map((project) => [project.directory, project])).values()];
  return unique.sort((left, right) => left.directory.localeCompare(right.directory));
}

function diffFiles() {
  if (!base || /^0+$/.test(base)) {
    return undefined;
  }

  try {
    return execFileSync("git", ["diff", "--name-only", base, head], {
      cwd: root,
      encoding: "utf8",
    })
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return undefined;
  }
}

const explicit = parseExplicit(explicitExtensions);
if (explicit) {
  process.stdout.write(`${JSON.stringify(matrix(explicit))}\n`);
  process.exit(0);
}

const files = diffFiles();
if (!files) {
  process.stdout.write(`${JSON.stringify(matrix(projects))}\n`);
  process.exit(0);
}

const sharedChangePrefixes = ["packages/", "tools/", ".github/workflows/release-extensions.yml"];
const sharedChangeFiles = ["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "tsconfig.base.json", "AGENTS.md"];
const releaseAll = files.some(
  (file) => sharedChangeFiles.includes(file) || sharedChangePrefixes.some((prefix) => file.startsWith(prefix)),
);

if (releaseAll) {
  process.stdout.write(`${JSON.stringify(matrix(projects))}\n`);
  process.exit(0);
}

const changedDirectories = new Set();
for (const file of files) {
  const match = /^extensions\/([^/]+)\//.exec(file);
  if (match?.[1] && byDirectory.has(match[1])) {
    changedDirectories.add(match[1]);
  }
}

const changedProjects = [...changedDirectories]
  .map((directory) => byDirectory.get(directory))
  .filter(Boolean)
  .sort((left, right) => left.directory.localeCompare(right.directory));

process.stdout.write(`${JSON.stringify(matrix(changedProjects))}\n`);
