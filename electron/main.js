const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');

let win = null;

function createWindow(port) {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    autoHideMenuBar: true,
    title: '报价管理系统',
  });
  // 点击 target=_blank 链接(如 PI 文件)时直接下载,不开新窗口
  win.webContents.setWindowOpenHandler(({ url }) => {
    win.webContents.downloadURL(url);
    return { action: 'deny' };
  });
  win.on('closed', () => { win = null; });
  win.loadURL(`http://127.0.0.1:${port}`);
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    // 数据库与上传文件写入用户数据目录(可写、升级不丢失)
    process.env.APP_DATA_DIR = app.getPath('userData');
    process.env.PORT = '0'; // 动态端口,避免与其他程序冲突

    try {
      const { server } = require(path.join(__dirname, '..', 'server', 'src', 'index.js'));
      const open = () => createWindow(server.address().port);
      if (server.listening) open();
      else server.once('listening', open);
      server.on('error', (e) => {
        dialog.showErrorBox('启动失败', `内置服务启动失败: ${e.message}`);
        app.quit();
      });
    } catch (e) {
      dialog.showErrorBox('启动失败', String(e.stack || e.message));
      app.quit();
    }
  });

  app.on('window-all-closed', () => app.quit());
}
