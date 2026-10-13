import { spawnSync } from "node:child_process";

const API = "https://api.github.com";
const GIT_EXE = process.env.GIT_EXE || "C:\\Program Files\\Git\\cmd\\git.exe";
const serverless = Boolean(process.env.VERCEL);
let credentialToken;

function gitEnv() {
  const env = {
    ...process.env,
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

function tokenFromGitCredential() {
  if (serverless) return "";
  const result = spawnSync(GIT_EXE, ["credential", "fill"], {
    input: "protocol=https\nhost=github.com\n\n",
    encoding: "utf8",
    env: gitEnv(),
    windowsHide: true,
    timeout: 8000,
  });
  if (result.status !== 0) return "";
  const match = String(result.stdout || "").match(/^password=(.+)$/m);
  return match ? match[1].trim() : "";
}

function token() {
  const fromEnv = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
  if (fromEnv) return fromEnv;
  if (credentialToken !== undefined) return credentialToken;
  credentialToken = tokenFromGitCredential() || "";
  return credentialToken;
}

function headers(extra = {}) {
  const out = {
    Accept: "application/vnd.github+json",
    "User-Agent": "catamaran-search",
    ...extra,
  };
  const t = token();
  if (t) out.Authorization = "Bearer " + t;
  return out;
}

export function hasGithubToken() {
  return Boolean(token());
}

export async function readGithubFile({ repo, path, branch = "main" }) {
  const url = `${API}/repos/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`;
  const response = await fetch(url, { headers: headers(), signal: AbortSignal.timeout(15000) });
  if (response.status === 404) return { text: null, sha: null, json: null };
  if (!response.ok) {
    throw new Error("GitHub GET " + path + " HTTP " + response.status);
  }
  const data = await response.json();
  const text = Buffer.from(data.content.replace(/\n/g, ""), "base64").toString("utf8");
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { text, sha: data.sha, json };
}

export async function writeGithubFile({ repo, path, branch = "main", contents, message, sha }) {
  if (!token()) throw new Error("Set GITHUB_TOKEN in Vercel so feedback can be written to GitHub.");
  const body = {
    message,
    content: Buffer.from(contents, "utf8").toString("base64"),
    branch,
  };
  if (sha) body.sha = sha;
  let response = await fetch(`${API}/repos/${repo}/contents/${path}`, {
    method: "PUT",
    headers: headers({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  if (response.status === 409 || response.status === 422) {
    const latest = await readGithubFile({ repo, path, branch });
    body.sha = latest.sha;
    response = await fetch(`${API}/repos/${repo}/contents/${path}`, {
      method: "PUT",
      headers: headers({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
  }
  if (!response.ok) {
    const errText = await response.text();
    throw new Error("GitHub PUT " + path + " HTTP " + response.status + " " + errText.slice(0, 300));
  }
  return response.json();
}
