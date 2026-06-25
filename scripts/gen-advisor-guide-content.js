// Bundles docs/advisor-guide.md into a TS string the app can import, so the
// in-app Guide page always matches the canonical markdown (and the PDF).
// Run after editing the guide:  node scripts/gen-advisor-guide-content.js
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const md = fs.readFileSync(path.join(root, "docs/advisor-guide.md"), "utf8");
const out =
  "// AUTO-GENERATED from docs/advisor-guide.md — do not edit by hand.\n" +
  "// Regenerate: node scripts/gen-advisor-guide-content.js\n" +
  "export const ADVISOR_GUIDE = " +
  JSON.stringify(md) +
  ";\n";
fs.writeFileSync(path.join(root, "src/content/advisor-guide.ts"), out);
console.log(`wrote src/content/advisor-guide.ts (${md.length} chars)`);
