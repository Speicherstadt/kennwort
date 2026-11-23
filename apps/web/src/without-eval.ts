/**
 * Imported first by main.tsx, before any module defines a schema: Zod probes for eval when a
 * schema is defined, and under the CSP every probe is a violation report (P-16, CSP)
 */
import { parseWithoutEval } from "@kennwort/core/without-eval";

parseWithoutEval();
