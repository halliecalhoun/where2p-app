import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dest = join(root, "www");
const paths = ["index.html", "privacy.html", "css", "js", "images"];

await rm(dest, { recursive: true, force: true });
await mkdir(dest, { recursive: true });

for (const path of paths) {
  await cp(join(root, path), join(dest, path), { recursive: true });
}

console.log("Copied the site into www/ for Capacitor. GitHub Pages still serves the repo root.");
