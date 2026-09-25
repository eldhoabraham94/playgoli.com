// Runs the server (tsx watch, :3000) and the client (Vite, :5173) together.
import { spawn } from 'node:child_process';

const run = (ws) => spawn('npm', ['run', 'dev', '-w', ws], { stdio: 'inherit', shell: true });
const procs = [run('@goli/server'), run('@goli/client')];

const stop = () => {
  for (const p of procs) p.kill();
  process.exit();
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const p of procs) p.on('exit', (code) => code && stop());
