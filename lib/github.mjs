const API = "https://api.github.com";

function token() {
  return process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
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
  if (!token()) throw new Error("Set GITHUB_TOKEN to write feedback on Vercel");
  const body = {
    message,
    content: Buffer.from(contents, "utf8").toString("base64"),
    branch,
  };
  if (sha) body.sha = sha;
  const response = await fetch(`${API}/repos/${repo}/contents/${path}`, {
    method: "PUT",
    headers: headers({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error("GitHub PUT " + path + " HTTP " + response.status + " " + errText.slice(0, 300));
  }
  return response.json();
}
