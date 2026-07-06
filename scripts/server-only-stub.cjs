/** No-op для `import "server-only"` при запуске worker/cron через tsx/node (не Next.js). */
const Module = require("node:module");

const originalLoad = Module._load;
Module._load = function serverOnlyStub(request, parent, isMain) {
  if (request === "server-only") return {};
  return originalLoad.apply(this, arguments);
};
