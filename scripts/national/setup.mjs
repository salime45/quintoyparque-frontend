import { spawn } from "node:child_process";
const child = spawn(process.env.PYTHON || (process.platform === "win32" ? "python" : "python3"),
  ["-m", "pip", "install", "--target", ".catalog-python", "--no-cache-dir", "-r", "scripts/national/requirements.txt"], { stdio: "inherit" });
child.on("error", (error) => { console.error(error.message); process.exitCode = 1; });
child.on("exit", (code) => { process.exitCode = code ?? 1; });
