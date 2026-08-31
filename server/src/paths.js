const path = require('path');
const fs = require('fs');

// 打包运行时(Electron)通过 APP_DATA_DIR 指向用户可写目录;开发时落在 server/ 下
const baseDir = process.env.APP_DATA_DIR || path.join(__dirname, '..');
const dataDir = path.join(baseDir, 'data');
const uploadsDir = path.join(baseDir, 'uploads');
for (const d of [dataDir, uploadsDir]) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

module.exports = { dataDir, uploadsDir };
