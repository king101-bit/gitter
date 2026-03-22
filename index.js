#!/usr/bin/env node

import { execSync } from 'child_process';
import readline from 'readline';

// ─── colour palette ───────────────────────────────────────────────────────────

const _ = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  green:   '\x1b[38;5;120m',
  yellow:  '\x1b[38;5;221m',
  cyan:    '\x1b[38;5;87m',
  red:     '\x1b[38;5;203m',
  magenta: '\x1b[38;5;213m',
  blue:    '\x1b[38;5;111m',
  gray:    '\x1b[38;5;245m',
  white:   '\x1b[97m',
  bgDark:  '\x1b[48;5;235m',
  bgCyan:  '\x1b[48;5;23m',
};

const paint = (color, text) => `${color}${text}${_.reset}`;
const cols = () => process.stdout.columns || 72;
const hr    = (ch, color)   => paint(color, ch.repeat(cols()));

// ─── step header ──────────────────────────────────────────────────────────────

function step(n, total, label) {
  console.log(`\n  ${paint(_.bgDark + _.bold + _.cyan, ` ${n}/${total} `)}  ${paint(_.bold + _.white, label)}`);
  console.log(`  ${paint(_.gray, '─'.repeat(cols() - 4))}`);
}

// ─── logger ───────────────────────────────────────────────────────────────────

const log = {
  info:  (m) => console.log(`  ${paint(_.cyan,   '◆')}  ${m}`),
  ok:    (m) => console.log(`  ${paint(_.green,  '✔')}  ${paint(_.green, m)}`),
  warn:  (m) => console.log(`  ${paint(_.yellow, '!')}  ${paint(_.yellow, m)}`),
  error: (m) => console.log(`  ${paint(_.red,    '✖')}  ${paint(_.red, m)}`),
  blank: ()  => console.log(),
};

// ─── simple text prompt ───────────────────────────────────────────────────────

function askText(rl, question) {
  return new Promise((res) =>
    rl.question(
      `\n  ${paint(_.bold + _.cyan, '?')}  ${paint(_.white, question)} ${paint(_.gray, '›')} `,
      (a) => res(a.trim())
    )
  );
}

// ─── arrow-key single select ──────────────────────────────────────────────────

function askSelect(question, options) {
  return new Promise((res) => {
    let cursor = 0;

    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf-8');

    const render = (clear = true) => {
      if (clear) process.stdout.write(`\x1b[${options.length + 1}A\x1b[0J`);
      console.log(` ${paint(_.bold + _.cyan, '❯')}  ${paint(_.white, question)}`);
      options.forEach((opt, i) => {
        const active = i === cursor;
        const marker = active ? paint(_.cyan + _.bold, ' ❯ ') : '   ';
        const label  = active ? paint(_.bold + _.white, opt) : paint(_.gray, opt);
        console.log(`    ${marker}${label}`);
      });
    };

    render(false);

    process.stdin.on('data', function onKey(key) {
      if (key === '\u001b[A' || key === 'k') cursor = Math.max(0, cursor - 1);
      if (key === '\u001b[B' || key === 'j') cursor = Math.min(options.length - 1, cursor + 1);
      if (key === '\r' || key === '\n') {
        process.stdin.removeListener('data', onKey);
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdout.write(`\x1b[${options.length + 1}A\x1b[0J`);
        console.log(`\n  ${paint(_.bold + _.cyan, '❯')}  ${paint(_.white, question)}  ${paint(_.cyan, options[cursor])}`);
        res(options[cursor]);
        return;
      }
      if (key === '\u0003') process.exit(1);
      render();
    });
  });
}

// ─── arrow-key multi select ───────────────────────────────────────────────────

function askMultiSelect(question, options) {
  return new Promise((res) => {
    let cursor = 0;
    const selected = new Set();

    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf-8');

    const render = (clear = true) => {
      if (clear) process.stdout.write(`\x1b[${options.length + 3}A\x1b[0J`);
      console.log(` ${paint(_.bold + _.cyan, '❯')}  ${paint(_.white, question)}  ${paint(_.gray, '(space to toggle, enter to confirm)')}`);
      options.forEach((opt, i) => {
        const active  = i === cursor;
        const checked = selected.has(i);
        const box     = checked ? paint(_.cyan + _.bold, '◉') : paint(_.gray, '○');
        const label   = active  ? paint(_.bold + _.white, opt.file) : paint(_.gray, opt.file);
        console.log(`    ${active ? paint(_.cyan, ' ❯') : '  '} ${box}  [${opt.badge}]  ${label}`);
      });
      console.log(paint(_.gray, `\n     ${selected.size} selected`));
    };

    render(false);

    process.stdin.on('data', function onKey(key) {
      if (key === '\u001b[A' || key === 'k') cursor = Math.max(0, cursor - 1);
      if (key === '\u001b[B' || key === 'j') cursor = Math.min(options.length - 1, cursor + 1);
      if (key === ' ') selected.has(cursor) ? selected.delete(cursor) : selected.add(cursor);
      if (key === '\r' || key === '\n') {
        process.stdin.removeListener('data', onKey);
        process.stdin.setRawMode(false);
        process.stdin.pause();
        const picked = [...selected].map((i) => options[i].file);
        process.stdout.write(`\x1b[${options.length + 3}A\x1b[0J`);
        console.log(`\n  ${paint(_.bold + _.cyan, '❯')}  ${paint(_.white, question)}  ${paint(_.cyan, `${picked.length} file(s) selected`)}`);
        res(picked);
        return;
      }
      if (key === '\u0003') process.exit(1);
      render();
    });
  });
}

// ─── git helpers ──────────────────────────────────────────────────────────────

function git(cmd) {
  try {
    return execSync(`git ${cmd}`, { encoding: 'utf-8' });
  } catch {
    return null;
  }
}

function requireRepo() {
  if (git('rev-parse --is-inside-work-tree') === null) {
    log.error('Not a git repository.');
    process.exit(1);
  }
}

function getChangedFiles() {
  const raw = git('status --short');
  if (!raw || !raw.trim()) return [];
  return raw
    .split('\n')
    .filter(Boolean)
    .map((l) => ({ status: l.slice(0, 2).trim(), file: l.slice(3).trim() }));
}

function statusBadge(code) {
  const map = {
    M:   paint(_.yellow, 'modified'),
    A:   paint(_.green,  'new file'),
    D:   paint(_.red,    'deleted '),
    R:   paint(_.blue,   'renamed '),
    C:   paint(_.blue,   'copied  '),
    '?': paint(_.gray,   'untrack '),
    U:   paint(_.red,    'conflict'),
  };
  const key = code[0] === '?' ? '?' : code[0];
  return map[key] || paint(_.gray, code.padEnd(8));
}

function stageFiles(files) {
  for (const f of files) {
    if (git(`add -- "${f}"`) === null) log.warn(`Could not stage: ${f}`);
  }
}

function currentBranch() {
  return (git('rev-parse --abbrev-ref HEAD') || 'HEAD').trim();
}

function inferType(files) {
  const names = files.map((f) => f.toLowerCase());
  if (names.every((f) => /\.(md|txt|rst)$/.test(f)))                  return 'docs';
  if (names.every((f) => /(test|spec)\.|\.test\.|\.spec\./.test(f)))  return 'test';
  if (names.every((f) => /\.(css|scss|less|styled)$/.test(f)))        return 'style';
  if (names.some((f)  => /(package\.json|lock)/.test(f)))             return 'chore';
  return 'chore';
}

// ─── main ─────────────────────────────────────────────────────────────────────

const AUTO_MODE    = process.argv.includes('--auto');
const COMMIT_TYPES = ['feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'chore'];

(async () => {
  requireRepo();

  const totalSteps = AUTO_MODE ? 2 : 3;

  // ── 1. detect + stage ─────────────────────────────────────────────────────

  step(1, totalSteps, 'Scanning for changes');

  const changed = getChangedFiles();

  if (changed.length === 0) {
    log.warn('Working tree is clean — nothing to commit.');
    log.blank();
    process.exit(0);
  }

  log.blank();
  log.info(`Found ${paint(_.bold + _.white, String(changed.length))} changed file(s):`);
  log.blank();

  let toStage = [];

  if (AUTO_MODE) {
    toStage = changed.map(({ file }) => file);
    changed.forEach(({ status, file }, i) => {
      const idx = paint(_.gray, String(i + 1).padStart(3) + '.');
      console.log(`     ${idx}  [${statusBadge(status)}]  ${paint(_.white, file)}`);
    });
    log.blank();
    log.info(`Auto-staging all ${paint(_.bold + _.white, String(toStage.length))} file(s).`);
  } else {
    const stageChoice = await askSelect('Stage files', ['All files', 'Pick specific files']);

    if (stageChoice === 'Pick specific files') {
      const fileOptions = changed.map(({ status, file }) => ({
        file,
        badge: statusBadge(status),
      }));
      const picked = await askMultiSelect('Select files to stage', fileOptions);
      if (picked.length === 0) {
        log.error('No files selected. Aborting.');
        process.exit(1);
      }
      toStage = picked;
    } else {
      toStage = changed.map(({ file }) => file);
    }

    log.blank();
    log.info(`Staging ${paint(_.bold + _.white, String(toStage.length))} file(s).`);
  }

  stageFiles(toStage);

  const diff = git('diff --staged');
  if (!diff || !diff.trim()) {
    log.error('Nothing staged. Aborting.');
    process.exit(1);
  }

  log.blank();
  log.ok(`${toStage.length} file(s) staged.`);

  // ── 2. commit ─────────────────────────────────────────────────────────────

  step(2, totalSteps, 'Craft your commit');

  let type, scope = '', desc;

  if (AUTO_MODE) {
    type = inferType(toStage);
    log.info(`Inferred type: ${paint(_.bold + _.cyan, type)}`);
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    desc = await askText(rl, 'Description');
    rl.close();
  } else {
    type = await askSelect('Commit type', COMMIT_TYPES);
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    scope = await askText(rl, `Scope  ${paint(_.gray, '(optional — press enter to skip)')}`);
    desc  = await askText(rl, 'Description');
    rl.close();
  }

  if (!desc.trim()) {
    log.error('Description is required. Aborting.');
    process.exit(1);
  }

  const scopePart = scope ? `(${scope})` : '';
  const message   = `${type}${scopePart}: ${desc}`;

  log.blank();
  console.log(`  ${paint(_.gray, 'preview  ╌╌  ')}${paint(_.bold + _.white, message)}`);
  log.blank();

  const safeMsg = message.replace(/"/g, '\\"');
  try {
    execSync(`git commit -m "${safeMsg}"`, { stdio: 'inherit' });
    log.blank();
    log.ok('Committed.');
  } catch {
    log.error('Commit failed.');
    process.exit(1);
  }

  // ── 3. summary ────────────────────────────────────────────────────────────

  step(totalSteps, totalSteps, 'Done');

  const branch = currentBranch();
  console.log();

  const row = (label, value) =>
    console.log(`  ${paint(_.gray, label.padEnd(12))}  ${value}`);

  row('branch',  paint(_.bold + _.white, branch));
  row('staged',  paint(_.bold + _.white, `${toStage.length} file(s)`));
  row('message', paint(_.bold + _.white, message));

  console.log();
  console.log(hr('═', _.magenta));
  console.log();
})();