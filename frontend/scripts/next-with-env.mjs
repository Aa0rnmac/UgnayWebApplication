import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

const nextBin = resolve(process.cwd(), "node_modules", "next", "dist", "bin", "next");
const envFiles = [".env.shared", ".env.local"];

const nodeArgs = [];
for (const envFile of envFiles) {
  const absolutePath = resolve(process.cwd(), envFile);
  if (existsSync(absolutePath)) {
    nodeArgs.push(`--env-file=${absolutePath}`);
  }
}

nodeArgs.push(nextBin, ...process.argv.slice(2));

const child = spawn(process.execPath, nodeArgs, {
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
