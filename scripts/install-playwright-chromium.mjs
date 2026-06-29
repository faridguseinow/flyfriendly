import { spawn } from "node:child_process";

const args = process.platform === "linux"
  ? ["playwright", "install", "--with-deps", "chromium"]
  : ["playwright", "install", "chromium"];

const child = spawn("npx", args, {
  stdio: "inherit",
  shell: process.platform === "win32",
});

child.on("exit", (code) => {
  process.exit(code ?? 1);
});

child.on("error", (error) => {
  console.error(error.message || error);
  process.exit(1);
});
