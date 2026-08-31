const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { uploadsDir } = require('./paths');

function makeUploader(subdir, allowedExts, maxMB = 20) {
  const dest = path.join(uploadsDir, subdir);
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, dest),
    filename: (req, file, cb) => {
      const original = Buffer.from(file.originalname, 'latin1').toString('utf8');
      const ext = path.extname(original).toLowerCase();
      const base = path.basename(original, ext).replace(/[^\w\u4e00-\u9fa5-]+/g, '_').slice(0, 60);
      cb(null, `${Date.now()}_${base}${ext}`);
    },
  });
  return multer({
    storage,
    limits: { fileSize: maxMB * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      const original = Buffer.from(file.originalname, 'latin1').toString('utf8');
      const ext = path.extname(original).toLowerCase();
      if (allowedExts.includes(ext)) return cb(null, true);
      cb(new Error(`不支持的文件类型 ${ext},允许: ${allowedExts.join(', ')}`));
    },
  });
}

module.exports = { makeUploader };
