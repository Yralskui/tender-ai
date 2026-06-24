import { readFileSync, writeFileSync, readdirSync, statSync } from "fs";
import path from "path";

const root = path.join(process.cwd(), "src");

function walk(dir, files = []) {
  for (const f of readdirSync(dir)) {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) walk(p, files);
    else if (p.endsWith(".tsx")) files.push(p);
  }
  return files;
}

const replacements = [
  [/className="flex min-h-screen" style=\{\{ background: "#0f172a" \}\}/g, 'className="flex min-h-screen app-shell"'],
  [/className="min-h-screen" style=\{\{ background: "#0f172a", color: "#f1f5f9" \}\}/g, 'className="min-h-screen app-shell"'],
  [/className="min-h-screen flex items-center justify-center px-4" style=\{\{ background: "#0f172a" \}\}/g, 'className="min-h-screen flex items-center justify-center px-4 app-shell"'],
  [/rounded-2xl border border-slate-200 p-8" style=\{\{ background: "#1e293b" \}\}/g, 'rounded-2xl border border-slate-200 p-8 app-card"'],
  [/rounded-2xl border border-slate-200 p-6" style=\{\{ background: "#1e293b" \}\}/g, 'rounded-2xl border border-slate-200 p-6 app-card"'],
  [/rounded-2xl border border-slate-200 p-5" style=\{\{ background: "#1e293b" \}\}/g, 'rounded-2xl border border-slate-200 p-5 app-card"'],
  [/rounded-2xl border border-slate-200 overflow-hidden" style=\{\{ background: "#1e293b" \}\}/g, 'rounded-2xl border border-slate-200 overflow-hidden app-card"'],
  [/style=\{\{ background: "#1e293b" \}\}/g, 'className="app-card"'],
  [/style=\{\{ background: "#0f172a" \}\}/g, ""],
  [/border-slate-800/g, "border-slate-200"],
  [/border-slate-700/g, "border-slate-200"],
  [/border-slate-600/g, "border-slate-300"],
  [/hover:bg-slate-800/g, "hover:bg-slate-100"],
  [/hover:border-slate-500/g, "hover:border-slate-300"],
  [/hover:text-white/g, "hover:text-slate-900"],
  [/text-slate-300/g, "text-slate-700"],
  [/text-slate-400/g, "text-slate-600"],
  [/bg-slate-800/g, "bg-slate-100"],
  [/bg-slate-700/g, "bg-slate-200"],
];

let changed = 0;
for (const file of walk(root)) {
  let c = readFileSync(file, "utf8");
  const orig = c;
  for (const [re, rep] of replacements) c = c.replace(re, rep);
  if (c !== orig) {
    writeFileSync(file, c, "utf8");
    changed++;
    console.log("updated:", path.relative(root, file));
  }
}
console.log("done,", changed, "files");
