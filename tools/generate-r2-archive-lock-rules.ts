import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { r2ArchiveLockRules } from '../worker/archiveRetention.js';

const outputPath = resolve('worker/r2-archive-locks.json');
writeFileSync(outputPath, `${JSON.stringify({ rules: r2ArchiveLockRules() }, null, 2)}\n`, 'utf8');
process.stdout.write(`Wrote 101 prefix-scoped archive lock rules to ${outputPath}\n`);
