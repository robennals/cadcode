// CLI entry point. Parses argv and dispatches: `cadcode dev [dir|file]` starts
// the live render server; `cadcode export` is a stub until milestone M4.
import { startDev } from "./dev";

export async function main(argv: string[]): Promise<void> {
  const [cmd, target] = argv;
  if (cmd === "dev") {
    // target is optional: a directory (project root) or a single file to open.
    // Omitted => the current working directory.
    await startDev(target);
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
