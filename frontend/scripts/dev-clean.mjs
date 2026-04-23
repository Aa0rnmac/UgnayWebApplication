import { rmSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { networkInterfaces } from "node:os";

if (process.argv.includes("--clean")) {
  for (const dir of [".next", ".turbo"]) {
    rmSync(resolve(process.cwd(), dir), { recursive: true, force: true });
  }

  console.log("Cleared Next.js local caches.");
}

const nextBin = resolve(process.cwd(), "node_modules", "next", "dist", "bin", "next");

const networkUrls = Object.values(networkInterfaces())
  .flat()
  .filter((iface) => iface && iface.family === "IPv4" && !iface.internal)
  .map((iface) => `http://${iface.address}:3000`);

if (networkUrls.length > 0) {
  console.log("Available on your network:");
  for (const url of [...new Set(networkUrls)]) {
    console.log(`  - ${url}`);
  }
}

const child = spawn(process.execPath, [nextBin, "dev", "-H", "0.0.0.0", "-p", "3000"], {
  stdio: "inherit",
  env: process.env
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
