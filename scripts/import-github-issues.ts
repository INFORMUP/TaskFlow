#!/usr/bin/env -S npx tsx
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const BASE_URL = "https://taskflow.informup.org";
const FLOW_SLUG = "feature";
const PROJECT_ID = "3699c368-ddaf-4233-a569-05d78b0b4d0d";
const REPO = "INFORMUP/TaskFlow";

type Issue = { title: string; body: string; url: string };

function loadToken(): string {
  const path = join(homedir(), ".taskflow-import-token");
  const raw = readFileSync(path, "utf8").trim();
  if (!raw) throw new Error(`Empty token at ${path}`);
  return raw;
}

function fetchIssue(number: string): Issue {
  const out = execFileSync(
    "gh",
    ["issue", "view", number, "--repo", REPO, "--json", "title,body,url"],
    { encoding: "utf8" }
  );
  return JSON.parse(out) as Issue;
}

async function createTask(token: string, issue: Issue): Promise<string> {
  const description = `${issue.body}\n\n---\nImported from ${issue.url}`;
  const res = await fetch(`${BASE_URL}/api/v1/tasks`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      flow: FLOW_SLUG,
      title: issue.title,
      description,
      projectIds: [PROJECT_ID],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`POST /tasks failed (${res.status}): ${text}`);
  }
  const created = (await res.json()) as { id: string; key?: string };
  console.log(`  → created task ${created.key ?? created.id}`);
  return created.id;
}

function postBackLinkComment(issueNumber: string, taskId: string): void {
  const url = `${BASE_URL}/tasks/${FLOW_SLUG}/${taskId}`;
  execFileSync(
    "gh",
    ["issue", "comment", issueNumber, "--repo", REPO, "--body", `Imported into TaskFlow: ${url}`],
    { stdio: ["ignore", "inherit", "inherit"] }
  );
}

async function main(): Promise<void> {
  const numbers = process.argv.slice(2);
  if (numbers.length === 0) {
    console.error("usage: import-github-issues.ts <issue#> [<issue#>...]");
    process.exit(1);
  }
  const token = loadToken();
  for (const n of numbers) {
    console.log(`#${n}: fetching from GitHub`);
    const issue = fetchIssue(n);
    console.log(`  title: ${issue.title}`);
    const taskId = await createTask(token, issue);
    postBackLinkComment(n, taskId);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
