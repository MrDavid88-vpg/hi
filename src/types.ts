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

export type ExportStatus = {
  state: 'idle' | 'saving' | 'saved' | 'error';
  message: string;
};

export type LibraryFile = {
  fullPath: string;
  name: string;
  ext: string;
  type: 'image' | 'video' | 'other';
  size: number;
  mtime: number;
};

export type LibraryFolder = {
  fullPath: string;
  name: string;
};
