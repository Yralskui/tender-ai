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
  [/className="([^"]+)"\s+className="([^"]+)"/g, 'className="$1 $2"'],
  [/style=\{\{ background: plan\.highlight \? "linear-gradient\(135deg, #0f2d1a, #1e293b\)" : "var\(--app-surface\)" \}\}/g, ""],
  [
    /className=\{\`rounded-2xl p-8 border card-hover \$\{plan\.highlight \? "border-emerald-500\/50 relative" : "border-slate-200"\}\`\}/g,
    'className={`rounded-2xl p-8 border card-hover app-card ${plan.highlight ? "border-emerald-400 relative bg-gradient-to-br from-emerald-50 to-blue-50" : "border-slate-200"}`}',
  ],
  [
    /background: selectedPlan === p\.id \? `linear-gradient\(135deg, \$\{p\.color\}15, #1e293b\)` : "var\(--app-surface\)"/g,
    'background: selectedPlan === p.id ? `linear-gradient(135deg, ${p.color}15, var(--app-surface))` : "var(--app-surface)"',
  ],
  [/text-emerald-300/g, "text-emerald-700"],
  [/text-yellow-400/g, "text-amber-700"],
  [/text-red-400/g, "text-red-600"],
  [/text-emerald-400/g, "text-emerald-600"],
  [/text-blue-400/g, "text-blue-600"],
  [/text-red-400 opacity-50/g, "text-red-400 opacity-40"],
  [
    /className="p-5 text-center text-white border-l border-slate-200"/g,
    'className="p-5 text-center text-white border-l border-slate-200 bg-gradient-to-r from-blue-600 to-blue-700"',
  ],
  [
    /className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-all hover:opacity-90" className="btn-primary"/g,
    'className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white btn-primary transition-all hover:opacity-90"',
  ],
  [
    /className="w-full flex items-center justify-center gap-2 py-3\.5 rounded-xl font-medium text-white transition-all hover:opacity-90 disabled:opacity-50"/g,
    'className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-medium text-white btn-primary transition-all hover:opacity-90 disabled:opacity-50"',
  ],
  [
    /className="w-full py-3 rounded-xl font-medium text-white flex items-center justify-center gap-2 transition-all hover:opacity-90 disabled:opacity-50"/g,
    'className="w-full py-3 rounded-xl font-medium text-white btn-primary flex items-center justify-center gap-2 transition-all hover:opacity-90 disabled:opacity-50"',
  ],
  [
    /className="flex items-center gap-2 px-6 py-3 rounded-xl font-medium text-white transition-all hover:opacity-90 disabled:opacity-50"/g,
    'className="flex items-center gap-2 px-6 py-3 rounded-xl font-medium text-white btn-primary transition-all hover:opacity-90 disabled:opacity-50"',
  ],
  [
    /className="flex-1 py-3 rounded-xl font-medium text-white flex items-center justify-center gap-2 transition-all hover:opacity-90 disabled:opacity-50 text-sm"/g,
    'className="flex-1 py-3 rounded-xl font-medium text-white btn-primary flex items-center justify-center gap-2 transition-all hover:opacity-90 disabled:opacity-50 text-sm"',
  ],
  [
    /className=\{\`w-full flex items-center justify-center gap-2 py-3\.5 rounded-xl font-medium text-white transition-all \$\{canFinish/g,
    'className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-medium text-white btn-primary transition-all ${canFinish',
  ],
  [/text-sm font-medium text-white">Email/g, 'text-sm font-medium text-slate-900">Email'],
  [/text-sm font-medium text-white">Telegram/g, 'text-sm font-medium text-slate-900">Telegram'],
  [/text-sm font-medium text-white">\{t\.label\}/g, 'text-sm font-medium text-slate-900">{t.label}'],
  [
    /className=\{\`text-xs font-medium \$\{active \? "text-white"/g,
    'className={`text-xs font-medium ${active ? "text-blue-700"',
  ],
  [
    /className=\{\`font-semibold \$\{item\.hasIt \? "text-emerald-700" : "text-white"\}\}/g,
    'className={`font-semibold ${item.hasIt ? "text-emerald-700" : "text-slate-900"}`}',
  ],
  [
    /className=\{\`text-sm font-medium \$\{n\.read \? "text-slate-600" : "text-white"\}\}/g,
    'className={`text-sm font-medium ${n.read ? "text-slate-600" : "text-slate-900"}`}',
  ],
  [
    /className=\{\`text-xs font-medium leading-tight \$\{done \? "text-white" : "text-slate-600"\}\}/g,
    'className={`text-xs font-medium leading-tight ${done ? "text-slate-900" : "text-slate-600"}`}',
  ],
  [
    /className=\{\`text-sm \$\{selected \? "text-white" : "text-slate-700"\}\}/g,
    'className={`text-sm ${selected ? "text-blue-700 font-medium" : "text-slate-700"}`}',
  ],
  [
    /border border-emerald-500\/30" style=\{\{ background: "rgba\(16,185,129,0.1\)", color: "#34d399" \}\}/g,
    'border border-emerald-200 bg-emerald-50 text-emerald-700"',
  ],
];

let changed = 0;
for (const file of walk(root)) {
  let c = readFileSync(file, "utf8");
  let prev;
  do {
    prev = c;
    c = c.replace(/className="([^"]+)"\s+className="([^"]+)"/g, 'className="$1 $2"');
  } while (c !== prev);

  const orig = c;
  for (const [re, rep] of replacements) c = c.replace(re, rep);
  if (c !== orig) {
    writeFileSync(file, c, "utf8");
    changed++;
    console.log("fixed:", path.relative(root, file));
  }
}
console.log("pass 3 done,", changed, "files");
