import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SKIP_DIRS = new Set([".git", "node_modules", "data", "backups", "coverage"]);
const BLOCKED_FILE_PATTERNS = [
  /^\.env$/,
  /^\.env\.(?!example$).+/,
  /\.(pem|key|p12|pfx|crt|cer|jks|keystore|sqlite|db|dump|log)$/i,
  /^credentials\.json$/i,
  /^service-account.*\.json$/i
];

const SECRET_PATTERNS = [
  { name: "GitHub token", pattern: /github_pat_[A-Za-z0-9_]{20,}/ },
  { name: "Private key", pattern: /-----BEGIN (RSA |EC |OPENSSH |)PRIVATE KEY-----/ },
  { name: "Generic secret assignment", pattern: /\b(secret|token|password|private_key)\b\s*[:=]\s*["']?[A-Za-z0-9_\-+/=]{24,}/i },
  { name: "Alipay app id", pattern: /\b20\d{14}\b/ }
];

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, files);
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

function isBlockedFile(file) {
  const relative = path.relative(ROOT, file).replaceAll("\\", "/");
  const basename = path.basename(file);
  return BLOCKED_FILE_PATTERNS.some((pattern) => pattern.test(basename) || pattern.test(relative));
}

function isTextLike(file) {
  const ext = path.extname(file).toLowerCase();
  return [
    "",
    ".js",
    ".json",
    ".md",
    ".yml",
    ".yaml",
    ".html",
    ".css",
    ".example",
    ".txt"
  ].includes(ext);
}

const findings = [];

for (const file of walk(ROOT)) {
  const relative = path.relative(ROOT, file).replaceAll("\\", "/");
  if (isBlockedFile(file)) {
    findings.push(`${relative}: blocked file type for public release`);
    continue;
  }

  if (!isTextLike(file)) continue;
  const content = fs.readFileSync(file, "utf8");
  for (const rule of SECRET_PATTERNS) {
    if (rule.pattern.test(content)) {
      findings.push(`${relative}: possible ${rule.name}`);
    }
  }
}

if (findings.length) {
  console.error("Security scan failed:");
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}

console.log("Security scan passed.");
