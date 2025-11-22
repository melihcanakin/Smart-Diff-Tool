const path = require('path');
const fs = require('fs');
const diff = require('diff');

const SUPPORTED = ['.js', '.jsx', '.ts', '.tsx', '.json', '.css', '.scss', '.html', '.vue', '.py', '.java', '.go', '.rs'];
const IGNORED = ['node_modules', 'dist', 'build', '.git', 'coverage', '.next', '.nuxt'];

function isSupported(file) {
  const ext = path.extname(file);
  if (!SUPPORTED.includes(ext)) return false;
  return !IGNORED.some(dir => file.includes(dir));
}

function format(code, file) {
  try {
    const prettier = require('prettier');
    const ext = path.extname(file);
    
    let parser = 'babel';
    if (['.ts', '.tsx'].includes(ext)) parser = 'typescript';
    else if (ext === '.json') parser = 'json';
    else if (['.css', '.scss'].includes(ext)) parser = 'css';
    else if (ext === '.html') parser = 'html';
    else if (ext === '.vue') parser = 'vue';
    
    let config = {};
    const rc = path.join(process.cwd(), '.prettierrc');
    
    if (fs.existsSync(rc)) {
      try {
        config = JSON.parse(fs.readFileSync(rc, 'utf8'));
      } catch (e) {}
    }
    
    return prettier.format(code, { parser, ...config });
  } catch (err) {
    return code;
  }
}

function countLines(diffResult) {
  let count = 0;
  diffResult.forEach(part => {
    if (part.added || part.removed) {
      count += part.count || 0;
    }
  });
  return count;
}

function analyze(baseContent, featureContent, file) {
  if (!baseContent || !featureContent) return null;
  
  const baseFmt = format(baseContent, file);
  const featureFmt = format(featureContent, file);
  
  const total = diff.diffLines(baseContent, featureContent);
  const semantic = diff.diffLines(baseFmt, featureFmt);
  const noise = diff.diffLines(featureContent, featureFmt);
  
  const totalLines = countLines(total);
  const semanticLines = countLines(semantic);
  const noiseLines = countLines(noise);
  
  return {
    file,
    total: totalLines,
    semantic: semanticLines,
    noise: noiseLines,
    ratio: totalLines > 0 ? ((semanticLines / totalLines) * 100).toFixed(2) : '0.00'
  };
}

module.exports = { isSupported, analyze };
