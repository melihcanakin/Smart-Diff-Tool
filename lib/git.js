const { execSync } = require('child_process');
const cache = require('./cache');

function exec(cmd, silent = false) {
  try {
    return execSync(cmd, { 
      encoding: 'utf8', 
      stdio: silent ? 'pipe' : 'inherit' 
    });
  } catch (err) {
    return null;
  }
}

function isRepo() {
  const result = exec('git rev-parse --is-inside-work-tree', true);
  return result && result.trim() === 'true';
}

function branchExists(name) {
  return exec(`git rev-parse --verify ${name}`, true) !== null;
}

function getFileContent(branch, file) {
  const key = cache.hash(`${branch}:${file}`);
  const cached = cache.read(key);
  
  if (cached) return cached;
  
  const content = exec(`git show ${branch}:${file}`, true);
  
  if (content) {
    cache.write(key, content);
  }
  
  return content;
}

function getChangedFiles(base, feature) {
  const result = exec(`git diff --name-only ${base}...${feature}`, true);
  
  if (!result) return [];
  
  return result.split('\n').filter(f => f.trim());
}

module.exports = {
  isRepo,
  branchExists,
  getFileContent,
  getChangedFiles
};
