import { spawn } from "node:child_process";
import { resolve, delimiter } from "node:path";
const child = spawn(process.env.PYTHON || (process.platform === "win32" ? "python" : "python3"), ["-m", "unittest", "discover", "-s", "tests/osm", "-v"], {
  stdio: "inherit", env: { ...process.env, PYTHONPATH: [resolve(".catalog-python"), resolve("scripts/national"), process.env.PYTHONPATH].filter(Boolean).join(delimiter) },
});
child.on("error", (error) => { console.error(error.message); process.exitCode = 1; });
child.on("exit", (code) => { process.exitCode = code ?? 1; });
