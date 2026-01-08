import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  attachSceneImage,
  copyFileToFolder,
  ensureAssetsDir,
  fileExists,
  listDirectory,
  readFileBytes,
  readScenes,
  readSettings,
  replaceScenes,
  saveClipboardImageToFolder,
  searchInDirectory,
  saveSettings,
  toggleCharacter,
  updateScene,
  writeZipFile
} from './db';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const createWindow = () => {
  const preloadPath = app.isPackaged
    ? path.join(__dirname, 'preload.js')
    : path.join(app.getAppPath(), 'dist/electron/preload.js');
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(__dirname, '../index.html'));
  }
};

app.whenReady().then(async () => {
  await ensureAssetsDir();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('pick-directory', async () => {
  const browserWindow = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  const result = await dialog.showOpenDialog(browserWindow ?? undefined, {
    properties: ['openDirectory', 'createDirectory']
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle('open-in-explorer', async (_event, targetPath: string) => {
  if (path.extname(targetPath)) {
    shell.showItemInFolder(targetPath);
    return;
  }
  await shell.openPath(targetPath);
});

ipcMain.handle('write-file', async (_event, dir: string, filename: string, buffer: ArrayBuffer) => {
  await writeZipFile(dir, filename, buffer);
});

ipcMain.handle('read-file-bytes', async (_event, filePath: string) => readFileBytes(filePath));

ipcMain.handle('list-directory', async (_event, dirPath: string) => listDirectory(dirPath));

ipcMain.handle('search-directory', async (_event, dirPath: string, query: string) =>
  searchInDirectory(dirPath, query)
);

ipcMain.handle('file-exists', async (_event, filePath: string) => fileExists(filePath));

ipcMain.handle('copy-file-to-folder', async (_event, srcFilePath: string, destDirPath: string) =>
  copyFileToFolder(srcFilePath, destDirPath)
);

ipcMain.handle('save-clipboard-image-to-folder', async (_event, destDirPath: string, bytes, ext) =>
  saveClipboardImageToFolder(destDirPath, bytes, ext)
);

ipcMain.handle('read-settings', async () => readSettings());

ipcMain.handle('save-settings', async (_event, settings) => saveSettings(settings));

ipcMain.handle('read-scenes', async () => readScenes());

ipcMain.handle('replace-scenes', async (_event, scenes) => replaceScenes(scenes));

ipcMain.handle('update-scene', async (_event, scene) => updateScene(scene));

ipcMain.handle('attach-scene-image', async (_event, sceneId, bytes, ext) =>
  attachSceneImage(sceneId, bytes, ext)
);

ipcMain.handle('toggle-character', async (_event, sceneId, value) => toggleCharacter(sceneId, value));
