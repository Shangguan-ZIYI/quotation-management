const path = require('path');
const express = require('express');
const cors = require('cors');
const { uploadsDir } = require('./paths');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.use('/uploads', express.static(uploadsDir));

app.use('/api/products', require('./routes/products'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/inquiries', require('./routes/inquiries'));
app.use('/api/quotations', require('./routes/quotations'));
app.use('/api/dashboard', require('./routes/dashboard'));

// 生产模式下托管前端构建产物
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
const fs = require('fs');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^(?!\/api|\/uploads).*/, (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// 统一错误处理,避免静默失败
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || '服务器内部错误' });
});

const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${server.address().port}`);
});

module.exports = { app, server };
