/// <reference types="vite/client" />

import type { AppSettings, Scene } from './types';

declare global {
  interface Window {
    desktopAPI: {
      pickDirectory: () => Promise<string | null>;
      openInExplorer: (path: string) => Promise<void>;
      writeFile: (path: string, filename: string, buffer: ArrayBuffer) => Promise<void>;
      readFileBytes: (path: string) => Promise<ArrayBuffer>;
      listDirectory: (path: string) => Promise<{
        folders: { fullPath: string; name: string }[];
        files: { fullPath: string; name: string; ext: string; type: 'image' | 'video' | 'other'; size: number; mtime: number }[];
      }>;
      searchInDirectory: (path: string, query: string) => Promise<{
        folders: { fullPath: string; name: string }[];
        files: { fullPath: string; name: string; ext: string; type: 'image' | 'video' | 'other'; size: number; mtime: number }[];
      }>;
      fileExists: (path: string) => Promise<boolean>;
      copyFileToFolder: (srcFilePath: string, destDirPath: string) => Promise<string>;
      saveClipboardImageToFolder: (destDirPath: string, bytes: ArrayBuffer, ext: string) => Promise<string>;
      readSettings: () => Promise<AppSettings>;
      saveSettings: (settings: AppSettings) => Promise<void>;
      readScenes: () => Promise<Scene[]>;
      replaceScenes: (scenes: Scene[]) => Promise<Scene[]>;
      updateScene: (scene: Scene) => Promise<Scene>;
      attachSceneImage: (sceneId: string, bytes: ArrayBuffer, ext: string) => Promise<Scene>;
      toggleCharacter: (sceneId: string, value: boolean) => Promise<Scene>;
    };
  }
}

export {};
