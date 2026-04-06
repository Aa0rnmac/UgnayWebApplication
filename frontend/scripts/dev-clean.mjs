import { rmSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

for (const dir of [".next", ".turbo"]) {
  rmSync(resolve(process.cwd(), dir), { recursive: true, force: true });
}

const nextBin = resolve(process.cwd(), "node_modules", "next", "dist", "bin", "next");
const child = spawn(process.execPath, [nextBin, "dev"], {
  stdio: "inherit",
  env: process.env
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
