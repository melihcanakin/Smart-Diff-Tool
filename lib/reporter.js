const chalk = require('chalk');
const fs = require('fs');

function terminal(result, files, options = {}) {
  if (options.quiet) return;
  
  console.log('\n' + chalk.cyan('═'.repeat(70)));
  console.log(chalk.bold.white('  📊 Semantic Diff Analysis'));
  console.log(chalk.cyan('═'.repeat(70)) + '\n');
  
  console.log(chalk.gray('  Target:  ') + chalk.white(result.target));
  console.log(chalk.gray('  Files:   ') + chalk.white(files.length));
  console.log('');
  
  console.log(chalk.bold('  Statistics:'));
  console.log(chalk.gray('  ├─ Total:     ') + chalk.yellow(result.total));
  console.log(chalk.gray('  ├─ Semantic:  ') + chalk.green(result.semantic));
  console.log(chalk.gray('  ├─ Noise:     ') + chalk.red(result.noise));
  console.log(chalk.gray('  └─ Ratio:     ') + chalk.bold.cyan(result.ratio + '%'));
  console.log('');
  
  const ratio = parseFloat(result.ratio);
  const barLen = 50;
  const semBar = Math.round((ratio / 100) * barLen);
  const noiseBar = barLen - semBar;
  
  console.log(chalk.bold('  Breakdown:'));
  console.log('  ' + chalk.bgGreen(' '.repeat(semBar)) + chalk.bgRed(' '.repeat(noiseBar)));
  console.log('  ' + chalk.green('■ Semantic') + '  ' + chalk.red('■ Noise'));
  console.log('');
  
  if (ratio < 10) {
    console.log(chalk.yellow('  ⚠️  Low semantic ratio - mostly formatting'));
  } else if (ratio < 30) {
    console.log(chalk.cyan('  ℹ️  Moderate semantic ratio'));
  } else {
    console.log(chalk.green('  ✓ High semantic ratio'));
  }
  
  console.log('\n' + chalk.cyan('═'.repeat(70)) + '\n');
  
  if (options.detailed) {
    printDetailed(files);
  }
}

function printDetailed(files) {
  console.log(chalk.cyan('═'.repeat(70)));
  console.log(chalk.bold.white('  📄 File Details'));
  console.log(chalk.cyan('═'.repeat(70)) + '\n');
  
  const sorted = [...files].sort((a, b) => parseFloat(b.ratio) - parseFloat(a.ratio));
  
  sorted.forEach(f => {
    const r = parseFloat(f.ratio);
    let icon = '🔵';
    let color = chalk.blue;
    
    if (r < 10) {
      icon = '⚪';
      color = chalk.gray;
    } else if (r > 70) {
      icon = '🔴';
      color = chalk.red;
    } else if (r > 30) {
      icon = '🟡';
      color = chalk.yellow;
    }
    
    console.log(color(`  ${icon} ${f.file}`));
    console.log(chalk.gray(`     Total: ${f.total} | Semantic: ${f.semantic} | Noise: ${f.noise} | ${f.ratio}%`));
    console.log('');
  });
  
  console.log(chalk.cyan('═'.repeat(70)) + '\n');
}

function json(result) {
  console.log(JSON.stringify({
    analysis_target: result.target,
    total_lines_changed: result.total,
    semantic_lines_changed: result.semantic,
    noise_lines_changed: result.noise,
    semantic_to_total_ratio: result.ratio + '%'
  }, null, 2));
}

function html(result, files, output) {
  const ratio = parseFloat(result.ratio);
  
  const template = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Semantic Diff - ${result.target}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; padding: 20px; }
    .container { max-width: 900px; margin: 0 auto; background: white; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; }
    .header h1 { font-size: 24px; margin-bottom: 8px; }
    .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; padding: 30px; }
    .stat { text-align: center; padding: 20px; background: #f8f9fa; border-radius: 6px; }
    .stat h3 { font-size: 12px; color: #666; text-transform: uppercase; margin-bottom: 8px; }
    .stat .val { font-size: 28px; font-weight: bold; }
    .bar { margin: 0 30px 30px; height: 30px; background: #e9ecef; border-radius: 15px; overflow: hidden; display: flex; }
    .bar-sem { background: #28a745; width: ${ratio}%; display: flex; align-items: center; justify-content: center; color: white; font-size: 12px; font-weight: bold; }
    .bar-noise { background: #dc3545; width: ${100-ratio}%; display: flex; align-items: center; justify-content: center; color: white; font-size: 12px; font-weight: bold; }
    .files { padding: 0 30px 30px; }
    .file { background: #f8f9fa; padding: 15px; margin-bottom: 10px; border-radius: 6px; border-left: 3px solid #667eea; }
    .file-name { font-weight: 600; margin-bottom: 5px; }
    .file-stats { font-size: 13px; color: #666; }
    .footer { padding: 20px; text-align: center; color: #666; font-size: 13px; border-top: 1px solid #e9ecef; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📊 Semantic Diff Analysis</h1>
      <p>${result.target}</p>
    </div>
    <div class="stats">
      <div class="stat"><h3>Total</h3><div class="val" style="color:#ffc107">${result.total}</div></div>
      <div class="stat"><h3>Semantic</h3><div class="val" style="color:#28a745">${result.semantic}</div></div>
      <div class="stat"><h3>Noise</h3><div class="val" style="color:#dc3545">${result.noise}</div></div>
      <div class="stat"><h3>Ratio</h3><div class="val" style="color:#667eea">${result.ratio}%</div></div>
    </div>
    <div class="bar">
      <div class="bar-sem">${ratio > 10 ? ratio.toFixed(0) + '%' : ''}</div>
      <div class="bar-noise">${(100-ratio) > 10 ? (100-ratio).toFixed(0) + '%' : ''}</div>
    </div>
    <div class="files">
      ${files.map(f => `
        <div class="file">
          <div class="file-name">${f.file}</div>
          <div class="file-stats">Total: ${f.total} | Semantic: ${f.semantic} | Noise: ${f.noise} | Ratio: ${f.ratio}%</div>
        </div>
      `).join('')}
    </div>
    <div class="footer">
      Generated by semantic-diff v2.0 · Melihcan Akın
    </div>
  </div>
</body>
</html>`;
  
  fs.writeFileSync(output, template);
  console.log(chalk.green(`\n✓ Report saved: ${output}\n`));
}

module.exports = { terminal, json, html };
