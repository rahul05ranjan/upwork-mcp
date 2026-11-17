// electron-builder always drops node_modules from extraResources, but the
// Next.js standalone server needs its own node_modules. So copy the whole
// prepared server folder into the app's resources after packing.
const { cpSync, existsSync } = require("node:fs");
const path = require("node:path");

exports.default = async function afterPack(context) {
  const src = path.join(context.packager.projectDir, "server");
  if (!existsSync(path.join(src, "server.js"))) {
    throw new Error("desktop/server is missing; run `npm run prepare-server` first.");
  }
  const resources =
    context.electronPlatformName === "darwin"
      ? path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, "Contents", "Resources")
      : path.join(context.appOutDir, "resources");
  cpSync(src, path.join(resources, "server"), { recursive: true, dereference: true });
};
