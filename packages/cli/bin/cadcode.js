#!/usr/bin/env node
// Thin bin shim. For local development prefer `pnpm cadcode <args>`, which runs
// the TypeScript entry through tsx. This shim runs the compiled output when the
// package has been built to JS.
import { main } from "../src/index.js";
main(process.argv.slice(2));
