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
  [/font-bold text-white/g, "font-bold text-slate-900"],
  [/font-semibold text-white/g, "font-semibold text-slate-900"],
  [/text-white font-semibold/g, "text-slate-900 font-semibold"],
  [/text-white font-medium/g, "text-slate-900 font-medium"],
  [/text-white font-bold/g, "text-slate-900 font-bold"],
  [/text-white truncate/g, "text-slate-900 truncate"],
  [/text-white mb-1/g, "text-slate-900 mb-1"],
  [/text-white mb-2/g, "text-slate-900 mb-2"],
  [/text-white mb-3/g, "text-slate-900 mb-3"],
  [/text-white mb-4/g, "text-slate-900 mb-4"],
  [/text-white leading-snug/g, "text-slate-900 leading-snug"],
  [/className="text-white font-semibold"/g, 'className="text-slate-900 font-semibold"'],
  [
    /border border-slate-300 text-white placeholder-slate-500 outline-none focus:border-blue-500 transition-colors text-sm/g,
    "app-input w-full px-4 py-3 rounded-xl text-sm transition-colors",
  ],
  [
    /border border-slate-300 text-white placeholder-slate-500 outline-none focus:border-emerald-500 transition-colors text-sm/g,
    "app-input w-full px-4 py-3 rounded-xl text-sm transition-colors",
  ],
  [
    /border border-slate-300 text-white outline-none focus:border-blue-500 transition-colors text-sm/g,
    "app-input w-full px-4 py-3 rounded-xl text-sm transition-colors",
  ],
  [/style=\{\{ background: "#0f172a", colorScheme: "dark" \}\}/g, ""],
  [
    /className="border-b border-slate-200 sticky top-0 z-50" style=\{\{ background: "rgba\(15,23,42,0.95\)", backdropFilter: "blur\(12px\)" \}\}/g,
    'className="border-b border-slate-200 sticky top-0 z-50 app-nav-glass"',
  ],
  [
    /className="border-b border-slate-200 py-4 px-6 flex items-center justify-between" style=\{\{ background: "rgba\(15,23,42,0.95\)" \}\}/g,
    'className="border-b border-slate-200 py-4 px-6 flex items-center justify-between app-nav-glass"',
  ],
  [/style=\{\{ background: "linear-gradient\(135deg, #3b82f6, #10b981\)" \}\}/g, 'className="btn-primary"'],
  [/style=\{\{ background: "linear-gradient\(135deg, #10b981, #3b82f6\)" \}\}/g, 'className="btn-primary"'],
  [/style=\{\{ background: "linear-gradient\(135deg, #0ea5e9, #0284c7\)" \}\}/g, 'className="btn-primary"'],
  [/: "#1e293b"/g, ': "var(--app-surface)"'],
  [/: "#0f172a"/g, ': "var(--app-bg)"'],
  [
    /style=\{\{ background: n\.read \? "rgba\(30,41,59,0.5\)" : "#1e293b" \}\}/g,
    'className={n.read ? "app-card-muted opacity-80" : "app-card"}',
  ],
  [
    /style=\{\{ background: isDragging \? "rgba\(59,130,246,0.08\)" : "#1e293b" \}\}/g,
    'className={isDragging ? "alert-info" : "app-card"}',
  ],
  [
    /style=\{\{ background: item\.hasIt \? "rgba\(16,185,129,0.05\)" : "#1e293b" \}\}/g,
    'className={item.hasIt ? "alert-success" : "app-card"}',
  ],
  [
    /style=\{\{ background: active \? "rgba\(59,130,246,0.08\)" : done \? "rgba\(16,185,129,0.05\)" : "#1e293b" \}\}/g,
    'style={{ background: active ? "var(--app-nav-active-bg)" : done ? "#e6f7f0" : "var(--app-surface)" }}',
  ],
  [
    /style=\{\{ background: plan\.highlight \? "linear-gradient\(135deg, #0f2d1a, #1e293b\)" : "#1e293b" \}\}/g,
    'className={plan.highlight ? "bg-gradient-to-br from-emerald-50 to-blue-50" : "app-card"}',
  ],
  [
    /background: selectedPlan === p\.id \? `linear-gradient\(135deg, \$\{p\.color\}15, #1e293b\)` : "#1e293b"/g,
    'background: selectedPlan === p.id ? `linear-gradient(135deg, ${p.color}15, var(--app-surface))` : "var(--app-surface)"',
  ],
  [/text-slate-700 hover:border-slate-400/g, "text-slate-700 hover:border-slate-400 hover:bg-slate-50"],
  [/className="font-bold text-lg text-white"/g, 'className="font-bold text-lg text-slate-900"'],
  [/className="font-bold text-xl text-white"/g, 'className="font-bold text-xl text-slate-900"'],
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
console.log("pass 2 done,", changed, "files");
