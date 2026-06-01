// CLI entry point. Parses argv and dispatches: `cadcode dev <file>` starts the
// live editor server; `cadcode export` is a stub until milestone M4.
import { startDev } from "./dev";

export async function main(argv: string[]): Promise<void> {
  const [cmd, file] = argv;
  if (cmd === "dev") {
    if (!file) {
      console.error("usage: cadcode dev <file.ts>");
      process.exit(1);
    }
    await startDev(file);
  } else if (cmd === "export") {
    console.error("export is implemented in milestone M4");
    process.exit(1);
  } else {
    console.error("usage: cadcode <dev|export> ...");
    process.exit(1);
  }
}

export { startDev, readModelFile, writeModelFile } from "./dev";

// Run as a CLI when invoked directly (e.g. via `tsx packages/cli/src/index.ts`).
const invokedPath = process.argv[1] ?? "";
if (invokedPath.endsWith("index.ts") || invokedPath.endsWith("cadcode.js")) {
  main(process.argv.slice(2));
}
