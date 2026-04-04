import { spawn } from "node:child_process";
import net from "node:net";

const children = [];
let shuttingDown = false;

function startProcess(name, command, args, options = {}) {
  const child = spawn(command, args, {
    stdio: "inherit",
    shell: false,
    ...options,
  });
  child.__name = name;
  children.push(child);

  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    const normalReloadExit = name === "api" && code === 0;
    if (normalReloadExit) return;
    shuttingDown = true;
    for (const proc of children) {
      if (!proc.killed) {
        proc.kill("SIGTERM");
      }
    }
    const reason = signal ? `signal ${signal}` : `code ${code ?? 0}`;
    process.exitCode = code ?? 1;
    console.error(`\n[dev] ${name} exited with ${reason}`);
  });

  child.on("error", (error) => {
    if (shuttingDown) return;
    shuttingDown = true;
    for (const proc of children) {
      if (!proc.killed) {
        proc.kill("SIGTERM");
      }
    }
    console.error(`\n[dev] failed to start ${name}: ${error.message}`);
    process.exit(1);
  });

  return child;
}

function shutdown(signal = "SIGTERM") {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) {
      child.kill(signal);
    }
  }
}

function isPortOpen(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host });
    socket.once("connect", () => {
      socket.end();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
    socket.setTimeout(1000, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

process.on("SIGINT", () => {
  shutdown("SIGINT");
  process.exit(0);
});

process.on("SIGTERM", () => {
  shutdown("SIGTERM");
  process.exit(0);
});

const apiPortInUse = await isPortOpen(8000);
if (apiPortInUse) {
  console.log("[dev] reusing existing API on http://127.0.0.1:8000");
} else {
  console.log("[dev] starting API on http://127.0.0.1:8000");
  startProcess("api", "./.venv/bin/python", [
    "-m",
    "uvicorn",
    "api:app",
    "--host",
    "127.0.0.1",
    "--port",
    "8000",
    "--reload",
  ]);
}

const webPortInUse = await isPortOpen(5173);
if (webPortInUse) {
  console.log("[dev] reusing existing web app on http://127.0.0.1:5173");
} else {
  console.log("[dev] starting web app on http://127.0.0.1:5173");
  startProcess("web", "npm", ["run", "dev:web"]);
}

if (children.length === 0) {
  console.log("[dev] both services are already running");
}
