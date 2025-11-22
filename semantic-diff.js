#!/usr/bin/env node

const chalk = require('chalk');
const git = require('./lib/git');
const analyzer = require('./lib/analyzer');
const reporter = require('./lib/reporter');

const VERSION = '2.0.0';

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    base: null,
    feature: null,
    detailed: false,
    output: null,
    threshold: null,
    quiet: false
  };
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--detailed' || arg === '-d') {
      opts.detailed = true;
    } else if (arg === '--output' || arg === '-o') {
      opts.output = args[++i];
    } else if (arg === '--threshold' || arg === '-t') {
      opts.threshold = parseFloat(args[++i]);
    } else if (arg === '--quiet' || arg === '-q') {
      opts.quiet = true;
    } else if (arg === '--help' || arg === '-h') {
      showHelp();
      process.exit(0);
    } else if (arg === '--version' || arg === '-v') {
      console.log(VERSION);
      process.exit(0);
    } else if (!opts.base) {
      opts.base = arg;
    } else if (!opts.feature) {
      opts.feature = arg;
    }
  }
  
  return opts;
}

function showHelp() {
  console.log(`
${chalk.bold.cyan('semantic-diff')} v${VERSION}

${chalk.bold('USAGE')}
  semantic-diff <base> <feature> [options]

${chalk.bold('ARGUMENTS')}
  base          Base branch (e.g., main)
  feature       Feature branch to compare

${chalk.bold('OPTIONS')}
  -d, --detailed       Show file-by-file breakdown
  -o, --output <file>  Generate HTML report
  -t, --threshold <n>  Minimum semantic ratio (exit 1 if below)
  -q, --quiet          Suppress output
  -h, --help           Show this help
  -v, --version        Show version

${chalk.bold('EXAMPLES')}
  semantic-diff main feature-branch
  semantic-diff main feature-branch --detailed
  semantic-diff main feature-branch --output report.html
  semantic-diff main feature-branch --threshold 20

${chalk.gray('Created by Melihcan Akın · @Smart-Yazilim')}
`);
}

function error(msg, code = 1) {
  console.error(chalk.red('\n✗ ' + msg + '\n'));
  process.exit(code);
}

function run() {
  const opts = parseArgs();
  
  if (!opts.base || !opts.feature) {
    showHelp();
    process.exit(1);
  }
  
  if (!git.isRepo()) {
    error('Not a git repository');
  }
  
  if (!git.branchExists(opts.base)) {
    error(`Branch not found: ${opts.base}`);
  }
  
  if (!git.branchExists(opts.feature)) {
    error(`Branch not found: ${opts.feature}`);
  }
  
  if (!opts.quiet) {
    console.log(chalk.cyan('\n🔍 Analyzing changes...\n'));
  }
  
  const changed = git.getChangedFiles(opts.base, opts.feature);
  const supported = changed.filter(analyzer.isSupported);
  
  if (supported.length === 0) {
    error('No supported files changed');
  }
  
  if (!opts.quiet) {
    console.log(chalk.gray(`Found ${supported.length} file(s)\n`));
  }
  
  let totalLines = 0;
  let semanticLines = 0;
  let noiseLines = 0;
  const fileResults = [];
  
  supported.forEach((file, i) => {
    if (!opts.quiet) {
      process.stdout.write(chalk.gray(`  [${i+1}/${supported.length}] ${file}...`));
    }
    
    const base = git.getFileContent(opts.base, file);
    const feature = git.getFileContent(opts.feature, file);
    const result = analyzer.analyze(base, feature, file);
    
    if (result) {
      totalLines += result.total;
      semanticLines += result.semantic;
      noiseLines += result.noise;
      fileResults.push(result);
      
      if (!opts.quiet) {
        process.stdout.write(chalk.green(' ✓\n'));
      }
    } else {
      if (!opts.quiet) {
        process.stdout.write(chalk.yellow(' ⚠\n'));
      }
    }
  });
  
  const ratio = totalLines > 0 ? ((semanticLines / totalLines) * 100).toFixed(2) : '0.00';
  
  const result = {
    target: `${opts.base}...${opts.feature}`,
    total: totalLines,
    semantic: semanticLines,
    noise: noiseLines,
    ratio: ratio
  };
  
  reporter.terminal(result, fileResults, opts);
  
  if (!opts.quiet) {
    console.log(chalk.bold('JSON Output:'));
    reporter.json(result);
    console.log('');
  }
  
  if (opts.output) {
    reporter.html(result, fileResults, opts.output);
  }
  
  if (opts.threshold && parseFloat(ratio) < opts.threshold) {
    error(`Semantic ratio ${ratio}% below threshold ${opts.threshold}%`, 1);
  }
}

try {
  run();
} catch (err) {
  error(err.message);
}
