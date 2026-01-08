import { app } from 'electron';
import { promises as fs } from 'fs';
import path from 'path';

const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
const videoExtensions = new Set(['.mp4', '.mov', '.m4v', '.mkv']);

export type Scene = {
  id: string;
  code: string;
  enText: string;
  viText: string;
  keywords: string;
  primaryImagePath: string | null;
  characterImage: boolean;
  updatedAt: number;
};

export type AppSettings = {
  autosaveEnabled: boolean;
  saveDirectory: string;
  lastSavedAt: number | null;
  libraryRoots: string[];
};

type PersistedData = {
  settings: AppSettings;
  scenes: Scene[];
};

const defaultSettings: AppSettings = {
  autosaveEnabled: false,
  saveDirectory: '',
  lastSavedAt: null,
  libraryRoots: []
};

const ensureDir = async (dir: string) => {
  await fs.mkdir(dir, { recursive: true });
};

const dataPath = () => path.join(app.getPath('userData'), 'storyboard-db.json');
const assetDir = () => path.join(app.getPath('userData'), 'assets');

let cached: PersistedData | null = null;

export const loadData = async (): Promise<PersistedData> => {
  if (cached) return cached;
  try {
    const raw = await fs.readFile(dataPath(), 'utf-8');
    cached = JSON.parse(raw) as PersistedData;
  } catch {
    cached = { settings: defaultSettings, scenes: [] };
    await persist();
  }
  return cached;
};

const persist = async () => {
  if (!cached) return;
  await ensureDir(app.getPath('userData'));
  await fs.writeFile(dataPath(), JSON.stringify(cached, null, 2), 'utf-8');
};

export const readSettings = async () => {
  const data = await loadData();
  return data.settings;
};

export const saveSettings = async (settings: AppSettings) => {
  const data = await loadData();
  data.settings = settings;
  await persist();
};

export const readScenes = async () => {
  const data = await loadData();
  return data.scenes;
};

export const replaceScenes = async (scenes: Scene[]) => {
  const data = await loadData();
  data.scenes = scenes;
  await persist();
  return scenes;
};

export const updateScene = async (scene: Scene) => {
  const data = await loadData();
  data.scenes = data.scenes.map((item) => (item.id === scene.id ? scene : item));
  await persist();
  return scene;
};

export const toggleCharacter = async (sceneId: string, value: boolean) => {
  const data = await loadData();
  const scene = data.scenes.find((item) => item.id === sceneId);
  if (!scene) throw new Error('Scene not found');
  scene.characterImage = value;
  scene.updatedAt = Date.now();
  await persist();
  return scene;
};

export const attachSceneImage = async (sceneId: string, bytes: ArrayBuffer, ext: string) => {
  const data = await loadData();
  const scene = data.scenes.find((item) => item.id === sceneId);
  if (!scene) throw new Error('Scene not found');
  await ensureDir(assetDir());
  const fileName = `${sceneId}_${Date.now()}.${ext}`;
  const fullPath = path.join(assetDir(), fileName);
  await fs.writeFile(fullPath, Buffer.from(bytes));
  scene.primaryImagePath = fullPath;
  scene.updatedAt = Date.now();
  await persist();
  return scene;
};

export const ensureAssetsDir = async () => {
  await ensureDir(assetDir());
};

export const writeZipFile = async (dir: string, filename: string, bytes: ArrayBuffer) => {
  await ensureDir(dir);
  const fullPath = path.join(dir, filename);
  await fs.writeFile(fullPath, Buffer.from(bytes));
};

export const getAssetDir = () => assetDir();

export const readFileBytes = async (filePath: string) => {
  const data = await fs.readFile(filePath);
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
};

const classifyFile = (ext: string) => {
  if (imageExtensions.has(ext)) return 'image';
  if (videoExtensions.has(ext)) return 'video';
  return 'other';
};

export const listDirectory = async (dirPath: string) => {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const folders: { fullPath: string; name: string }[] = [];
  const files: { fullPath: string; name: string; ext: string; type: 'image' | 'video' | 'other'; size: number; mtime: number }[] = [];
  await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        folders.push({ fullPath, name: entry.name });
      } else if (entry.isFile()) {
        const stats = await fs.stat(fullPath);
        const ext = path.extname(entry.name).toLowerCase();
        files.push({
          fullPath,
          name: entry.name,
          ext,
          type: classifyFile(ext),
          size: stats.size,
          mtime: stats.mtimeMs
        });
      }
    })
  );
  folders.sort((a, b) => a.name.localeCompare(b.name));
  files.sort((a, b) => a.name.localeCompare(b.name));
  return { folders, files };
};

export const searchInDirectory = async (dirPath: string, query: string) => {
  const { folders, files } = await listDirectory(dirPath);
  const normalized = query.toLowerCase();
  return {
    folders,
    files: files.filter((file) => file.name.toLowerCase().includes(normalized))
  };
};

export const fileExists = async (filePath: string) => {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
};

const ensureUniqueName = async (dirPath: string, baseName: string, ext: string) => {
  let counter = 0;
  let candidate = `${baseName}${ext}`;
  while (await fileExists(path.join(dirPath, candidate))) {
    counter += 1;
    candidate = `${baseName}_${counter}${ext}`;
  }
  return candidate;
};

export const copyFileToFolder = async (srcFilePath: string, destDirPath: string) => {
  await ensureDir(destDirPath);
  const parsed = path.parse(srcFilePath);
  const fileName = await ensureUniqueName(destDirPath, parsed.name, parsed.ext);
  const destination = path.join(destDirPath, fileName);
  await fs.copyFile(srcFilePath, destination);
  return destination;
};

export const saveClipboardImageToFolder = async (destDirPath: string, bytes: ArrayBuffer, ext: string) => {
  await ensureDir(destDirPath);
  const baseName = `clipboard_${Date.now()}`;
  const safeExt = ext.startsWith('.') ? ext : `.${ext}`;
  const fileName = await ensureUniqueName(destDirPath, baseName, safeExt);
  const destination = path.join(destDirPath, fileName);
  await fs.writeFile(destination, Buffer.from(bytes));
  return destination;
};
