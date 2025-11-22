const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CACHE_DIR = path.join(process.cwd(), '.semantic-diff-cache');
const CACHE_TTL = 3600000; // 1 hour

function hash(data) {
  return crypto.createHash('md5').update(data).digest('hex');
}

function read(key) {
  try {
    if (!fs.existsSync(CACHE_DIR)) return null;
    
    const file = path.join(CACHE_DIR, `${key}.json`);
    if (!fs.existsSync(file)) return null;
    
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    
    if (Date.now() - data.ts > CACHE_TTL) {
      fs.unlinkSync(file);
      return null;
    }
    
    return data.val;
  } catch (err) {
    return null;
  }
}

function write(key, value) {
  try {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
    
    const file = path.join(CACHE_DIR, `${key}.json`);
    fs.writeFileSync(file, JSON.stringify({ ts: Date.now(), val: value }));
  } catch (err) {
    // Silent fail
  }
}

module.exports = { hash, read, write };
