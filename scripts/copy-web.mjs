import { cp, mkdir, readFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dest = join(root, "www");
const paths = ["index.html", "privacy.html", "css", "js", "images"];

// cap sync copies www/ into the iOS app. js/config.js is the where2p-e3170
// web config; fail the copy if that file is not the one the app should ship.
const config = await readFile(join(root, "js", "config.js"), "utf8");
if (
  !config.includes('projectId: "where2p-e3170"') ||
  !config.includes("https://where2p-e3170-default-rtdb.firebaseio.com")
) {
  console.error("js/config.js must be the where2p-e3170 Firebase web config before it is copied into the iOS app.");
  process.exit(1);
}

await rm(dest, { recursive: true, force: true });
await mkdir(dest, { recursive: true });

for (const path of paths) {
  await cp(join(root, path), join(dest, path), { recursive: true });
}

console.log("Copied the site into www/ for Capacitor, including js/config.js for where2p-e3170. GitHub Pages still serves the repo root.");
