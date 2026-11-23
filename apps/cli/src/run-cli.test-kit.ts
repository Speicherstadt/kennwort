/**
 * Running the compiled `kennwort` in tests (K-606): with stdin as a pipe, or on a pseudo-terminal
 * through util-linux `script`, answering each prompt once it appears, as a person would type.
 */
import { spawn } from "node:child_process";

export type Ran = { code: number | null; stdout: string; stderr: string };

/** The CLI with stdin from a pipe: no terminal, so no question can be answered */
export const runPiped = (
  binary: string,
  args: string[],
  env: Record<string, string>,
  stdin = "",
): Promise<Ran> =>
  new Promise((resolve, reject) => {
    const child = spawn(binary, args, { env, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(stdin);
  });

const quoted = (word: string) => `'${word.replaceAll("'", "'\\''")}'`;

/**
 * The CLI on a pseudo-terminal: each answer is typed (with Enter) once its prompt shows up after
 * the previous one. Stdout and stderr both reach the terminal, so the transcript has both.
 */
export const runOnTerminal = (
  binary: string,
  args: string[],
  env: Record<string, string>,
  answers: [prompt: string, typed: string][],
  timeoutMs = 60_000,
): Promise<{ code: number | null; transcript: string }> =>
  new Promise((resolve, reject) => {
    const command = [binary, ...args].map(quoted).join(" ");
    const child = spawn("script", ["-qfec", command, "/dev/null"], {
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`no answer in time; transcript so far:\n${transcript}`));
    }, timeoutMs);
    let transcript = "";
    let seen = 0;
    const pending = [...answers];
    child.stdout.on("data", (chunk: Buffer) => {
      transcript += chunk.toString();
      const next = pending[0];
      if (!next) return;
      const at = transcript.indexOf(next[0], seen);
      if (at === -1) return;
      seen = at + next[0].length;
      pending.shift();
      child.stdin.write(`${next[1]}\r`);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      child.stdin.end();
      resolve({ code, transcript });
    });
  });
