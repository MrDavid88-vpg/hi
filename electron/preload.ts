import { contextBridge, ipcRenderer } from 'electron';
import type { AppSettings, Scene } from './db';

contextBridge.exposeInMainWorld('desktopAPI', {
  pickDirectory: () => ipcRenderer.invoke('pick-directory'),
  openInExplorer: (path: string) => ipcRenderer.invoke('open-in-explorer', path),
  writeFile: (path: string, filename: string, buffer: ArrayBuffer) =>
    ipcRenderer.invoke('write-file', path, filename, buffer),
  readFileBytes: (path: string) => ipcRenderer.invoke('read-file-bytes', path),
  listDirectory: (path: string) => ipcRenderer.invoke('list-directory', path),
  searchInDirectory: (path: string, query: string) => ipcRenderer.invoke('search-directory', path, query),
  fileExists: (path: string) => ipcRenderer.invoke('file-exists', path),
  copyFileToFolder: (srcFilePath: string, destDirPath: string) =>
    ipcRenderer.invoke('copy-file-to-folder', srcFilePath, destDirPath),
  saveClipboardImageToFolder: (destDirPath: string, bytes: ArrayBuffer, ext: string) =>
    ipcRenderer.invoke('save-clipboard-image-to-folder', destDirPath, bytes, ext),
  readSettings: (): Promise<AppSettings> => ipcRenderer.invoke('read-settings'),
  saveSettings: (settings: AppSettings) => ipcRenderer.invoke('save-settings', settings),
  readScenes: (): Promise<Scene[]> => ipcRenderer.invoke('read-scenes'),
  replaceScenes: (scenes: Scene[]): Promise<Scene[]> => ipcRenderer.invoke('replace-scenes', scenes),
  updateScene: (scene: Scene): Promise<Scene> => ipcRenderer.invoke('update-scene', scene),
  attachSceneImage: (sceneId: string, bytes: ArrayBuffer, ext: string): Promise<Scene> =>
    ipcRenderer.invoke('attach-scene-image', sceneId, bytes, ext),
  toggleCharacter: (sceneId: string, value: boolean): Promise<Scene> =>
    ipcRenderer.invoke('toggle-character', sceneId, value)
});
