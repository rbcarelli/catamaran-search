import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const GIT_EXE = process.env.GIT_EXE || "C:\\Program Files\\Git\\cmd\\git.exe";
const AUTHOR_NAME = process.env.GIT_AUTHOR_NAME || "rbcarelli";
const AUTHOR_EMAIL = process.env.GIT_AUTHOR_EMAIL || "46140681+rbcarelli@users.noreply.github.com";

function gitEnv() {
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: AUTHOR_NAME,
    GIT_AUTHOR_EMAIL: AUTHOR_EMAIL,
    GIT_COMMITTER_NAME: AUTHOR_NAME,
    GIT_COMMITTER_EMAIL: AUTHOR_EMAIL,
    GIT_TERMINAL_PROMPT: "0",
    GCM_INTERACTIVE: "never",
    GIT_ASKPASS: "",
  };
  delete env.VSCODE_GIT_ASKPASS_MAIN;
  delete env.VSCODE_GIT_ASKPASS_EXTRA_ARGS;
  delete env.VSCODE_GIT_ASKPASS_NODE;
  delete env.VSCODE_GIT_IPC_HANDLE;
  return env;
}

export function runGit(args, cwd) {
  const result = spawnSync(GIT_EXE, args, {
    cwd,
    encoding: "utf8",
    env: gitEnv(),
    windowsHide: true,
    timeout: 25000,
  });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    error: result.error ? String(result.error.message || result.error) : "",
  };
}

export function ensureClone({ cloneDir, repoUrl, branch }) {
  fs.mkdirSync(path.dirname(cloneDir), { recursive: true });
  if (!fs.existsSync(path.join(cloneDir, ".git"))) {
    if (fs.existsSync(cloneDir)) fs.rmSync(cloneDir, { recursive: true, force: true });
    const cloned = runGit(["clone", "--depth", "1", "--branch", branch, repoUrl, cloneDir], path.dirname(cloneDir));
    if (!cloned.ok) {
      throw new Error((cloned.stderr || cloned.error || "git clone failed").trim());
    }
    return { cloned: true, pulled: false };
  }
  const pulled = runGit(["pull", "--ff-only", "origin", branch], cloneDir);
  return { cloned: false, pulled: pulled.ok, pullError: pulled.ok ? null : (pulled.stderr || pulled.error).trim() };
}

function pullRebase(cloneDir, branch) {
  const fetch = runGit(["fetch", "origin", branch], cloneDir);
  if (!fetch.ok) return fetch;
  return runGit(["pull", "--rebase", "origin", branch], cloneDir);
}

export function writeAndCommit({ cloneDir, relPath, contents, message, branch = "main" }) {
  const full = path.join(cloneDir, ...relPath.split("/"));
  fs.mkdirSync(path.dirname(full), { recursive: true });
  const previous = fs.existsSync(full) ? fs.readFileSync(full, "utf8") : null;
  if (previous === contents) {
    return { changed: false, committed: false, pushed: false };
  }
  const ahead = pullRebase(cloneDir, branch);
  if (!ahead.ok) {
    throw new Error((ahead.stderr || ahead.error || "git pull --rebase failed").trim());
  }
  fs.writeFileSync(full, contents);
  const add = runGit(["add", "--", relPath], cloneDir);
  if (!add.ok) throw new Error((add.stderr || add.error || "git add failed").trim());
  const commit = runGit(["commit", "-m", message], cloneDir);
  if (!commit.ok) {
    const text = `${commit.stdout}\n${commit.stderr}\n${commit.error}`;
    if (/nothing to commit/i.test(text)) return { changed: true, committed: false, pushed: false };
    throw new Error((commit.stderr || commit.error || "git commit failed").trim());
  }
  let push = runGit(["push", "origin", "HEAD"], cloneDir);
  if (!push.ok && /non-fast-forward|rejected/i.test(`${push.stdout}\n${push.stderr}`)) {
    const retry = pullRebase(cloneDir, branch);
    if (retry.ok) push = runGit(["push", "origin", "HEAD"], cloneDir);
  }
  return {
    changed: true,
    committed: true,
    pushed: push.ok,
    pushError: push.ok ? null : (push.stderr || push.error || "git push failed").trim(),
  };
}
