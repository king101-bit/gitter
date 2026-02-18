#!/usr/bin/env node

import { execSync } from 'child_process';
import readline from 'readline';

let diff = '';
try {
    diff = execSync('git diff --staged', { encoding: 'utf-8' });

} catch {
    console.log('Not a git repository.');
    process.exit(1);
}

if (!diff.trim()) {
    console.log('No staged changes found. Stage files first.'); 
    process.exit(0);
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

const ask = (q) =>
    new Promise((res) => rl.question(q, (ans) => res(ans.trim())));


(async () => {
    const type = await ask("type (feat, fix, docs, style, refactor, perf, test, chore): ");
    const desc = await ask("description: ");
    const scope = await ask("Scope (optional):");

    rl.close();


    const scopePart = scope ? `(${scope})` : '';
    const safeDesc = desc.replace(/"/g, '\\"');
    const message = `${type}${scopePart}: ${safeDesc}`;

    try {
        execSync(`git commit -m "${message}"`, { stdio: 'inherit', });
    } catch {
        console.log('Commit failed.');
    }
})();