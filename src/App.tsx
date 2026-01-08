import { useEffect, useMemo, useRef, useState } from 'react';
import JSZip from 'jszip';
import TurndownService from 'turndown';
import type { AppSettings, ExportStatus, LibraryFile, LibraryFolder, Scene } from './types';

const motivationalLines = [
  'Hôm nay là ngày để tạo nên những khung hình tuyệt vời.',
  'Mỗi cảnh quay đều bắt đầu từ một bảng storyboard hoàn hảo.',
  'Hãy để ý tưởng của bạn bùng nổ trong từng khung hình.',
  'Tập trung và tỏa sáng với từng cảnh bạn tạo ra.',
  'Mọi chi tiết đều quan trọng để kể một câu chuyện xuất sắc.'
];

const defaultSettings: AppSettings = {
  autosaveEnabled: false,
  saveDirectory: '',
  lastSavedAt: null,
  libraryRoots: []
};

const normalizeCode = (raw: string) => {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const parts = trimmed.split(/[.-]/);
  const first = parts[0].padStart(3, '0').slice(-3);
  const rest = parts.slice(1).join(trimmed.includes('-') ? '-' : '.');
  return rest ? `${first}${trimmed.includes('-') ? '-' : '.'}${rest}` : first;
};

const codeMatches = (value: string) => /^\d+(?:[.-]\d+)*$/.test(value.trim());

const parseRows = (input: string) => {
  const lines = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const rows: Array<[string, string, string, string]> = [];
  lines.forEach((line) => {
    if (line.startsWith('|')) {
      const cols = line
        .split('|')
        .map((col) => col.trim())
        .filter((col) => col.length > 0);
      if (cols.length >= 4) {
        rows.push([cols[0], cols[1], cols[2], cols[3]]);
      }
    } else if (line.includes('\t')) {
      const cols = line.split('\t');
      if (cols.length >= 4) {
        rows.push([cols[0], cols[1], cols[2], cols[3]]);
      }
    }
  });
  return rows;
};

const sortScenes = (scenes: Scene[]) => {
  const parse = (code: string) => code.split(/[.-]/).map((part) => Number(part));
  return [...scenes].sort((a, b) => {
    const ap = parse(a.code);
    const bp = parse(b.code);
    const len = Math.max(ap.length, bp.length);
    for (let i = 0; i < len; i += 1) {
      const av = ap[i] ?? 0;
      const bv = bp[i] ?? 0;
      if (av !== bv) return av - bv;
    }
    return 0;
  });
};

const buildMarkdown = (rows: Array<[string, string, string, string]>) => {
  const header = '| Code | English | Vietnamese | Keywords |\n| --- | --- | --- | --- |';
  const body = rows
    .map((row) => `| ${row[0]} | ${row[1]} | ${row[2]} | ${row[3]} |`)
    .join('\n');
  return [header, body].filter(Boolean).join('\n');
};

const convertRowsToScenes = (rows: Array<[string, string, string, string]>): Scene[] => {
  const scenes = rows
    .filter((row) => codeMatches(row[0]))
    .map((row) => {
      const code = normalizeCode(row[0]);
      return {
        id: crypto.randomUUID(),
        code,
        enText: row[1] ?? '',
        viText: row[2] ?? '',
        keywords: row[3] ?? '',
        primaryImagePath: null,
        characterImage: false,
        updatedAt: Date.now()
      };
    });
  return sortScenes(scenes);
};

const getImageExtension = (fileType: string, fallbackName: string) => {
  if (fileType) {
    const parts = fileType.split('/');
    if (parts.length === 2) return parts[1];
  }
  const match = fallbackName.match(/\.([a-zA-Z0-9]+)$/);
  return match ? match[1] : 'png';
};

const generateExportZip = async (scenes: Scene[], setMissing: (missing: string[]) => void) => {
  const zip = new JSZip();
  const sceneFolder = zip.folder('scenes_images');
  const characterFolder = zip.folder('character_images');
  const csvRows = ['code,filename,enText,viText,keywords,CharacterImage'];
  const missingFiles: string[] = [];

  for (const scene of scenes) {
    const filename = scene.primaryImagePath
      ? `${scene.code}${scene.primaryImagePath.slice(scene.primaryImagePath.lastIndexOf('.'))}`
      : '';
    csvRows.push(
      [
        scene.code,
        filename,
        JSON.stringify(scene.enText ?? ''),
        JSON.stringify(scene.viText ?? ''),
        JSON.stringify(scene.keywords ?? ''),
        scene.characterImage ? 'TRUE' : 'FALSE'
      ].join(',')
    );
    if (scene.primaryImagePath && sceneFolder) {
      const exists = await window.desktopAPI.fileExists(scene.primaryImagePath);
      if (!exists) {
        missingFiles.push(scene.primaryImagePath);
      } else {
        const data = await window.desktopAPI.readFileBytes(scene.primaryImagePath);
        sceneFolder.file(filename, data);
        if (scene.characterImage && characterFolder) {
          characterFolder.file(filename, data);
        }
      }
    }
  }

  zip.file('mapping.csv', csvRows.join('\n'));
  setMissing(missingFiles);
  return zip.generateAsync({ type: 'arraybuffer' });
};

const App = () => {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [importInput, setImportInput] = useState('');
  const [importMarkdown, setImportMarkdown] = useState('');
  const [exportStatus, setExportStatus] = useState<ExportStatus>({ state: 'idle', message: '' });
  const [exportWarnings, setExportWarnings] = useState<string[]>([]);
  const [missingLinks, setMissingLinks] = useState<Record<string, boolean>>({});
  const [libraryRootDraft, setLibraryRootDraft] = useState('');
  const [libraryTree, setLibraryTree] = useState<Record<string, LibraryFolder[]>>({});
  const [libraryFiles, setLibraryFiles] = useState<LibraryFile[]>([]);
  const [librarySearch, setLibrarySearch] = useState('');
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [selectedLibraryFile, setSelectedLibraryFile] = useState<LibraryFile | null>(null);
  const [libraryTargetSceneId, setLibraryTargetSceneId] = useState<string | null>(null);
  const [libraryHint, setLibraryHint] = useState('');
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [libraryAddMode, setLibraryAddMode] = useState(false);
  const debounceRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const fileSceneIdRef = useRef<string | null>(null);
  const libraryFileInputRef = useRef<HTMLInputElement | null>(null);

  const motivationalLine = useMemo(
    () => motivationalLines[Math.floor(Math.random() * motivationalLines.length)],
    []
  );

  useEffect(() => {
    const load = async () => {
      const savedSettings = await window.desktopAPI.readSettings();
      const savedScenes = await window.desktopAPI.readScenes();
      setSettings(savedSettings ?? defaultSettings);
      setScenes(savedScenes ?? []);
    };
    load();
  }, []);

  useEffect(() => {
    const checkLinks = async () => {
      const entries: Record<string, boolean> = {};
      await Promise.all(
        scenes.map(async (scene) => {
          if (!scene.primaryImagePath) return;
          const exists = await window.desktopAPI.fileExists(scene.primaryImagePath);
          entries[scene.id] = !exists;
        })
      );
      setMissingLinks(entries);
    };
    if (scenes.length > 0) {
      checkLinks();
    } else {
      setMissingLinks({});
    }
  }, [scenes]);

  useEffect(() => {
    const handler = async (event: ClipboardEvent) => {
      if (!selectedSceneId) return;
      const items = event.clipboardData?.items ?? [];
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (!file) continue;
          const buffer = await file.arrayBuffer();
          const ext = getImageExtension(file.type, file.name);
          const updated = await window.desktopAPI.attachSceneImage(selectedSceneId, buffer, ext);
          setScenes((prev) => prev.map((scene) => (scene.id === updated.id ? updated : scene)));
          triggerAutosave();
        }
      }
    };
    window.addEventListener('paste', handler);
    return () => window.removeEventListener('paste', handler);
  }, [selectedSceneId]);

  const saveSettings = async (next: AppSettings) => {
    setSettings(next);
    await window.desktopAPI.saveSettings(next);
  };

  const triggerAutosave = () => {
    if (!settings.autosaveEnabled) return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(async () => {
      await handleExport(true);
    }, 10000);
  };

  const updateSceneField = async (sceneId: string, patch: Partial<Scene>) => {
    const scene = scenes.find((item) => item.id === sceneId);
    if (!scene) return;
    const next = { ...scene, ...patch, updatedAt: Date.now() };
    const updated = await window.desktopAPI.updateScene(next);
    setScenes((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    triggerAutosave();
  };

  const applyImport = async () => {
    const rows = parseRows(importMarkdown || importInput);
    const scenesToSave = convertRowsToScenes(rows);
    const saved = await window.desktopAPI.replaceScenes(scenesToSave);
    setScenes(saved);
    setShowImport(false);
    triggerAutosave();
  };

  const handleImportPaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const html = event.clipboardData.getData('text/html');
    if (html) {
      const turndownService = new TurndownService({ codeBlockStyle: 'fenced' });
      const markdown = turndownService.turndown(html);
      setImportMarkdown(markdown);
    } else {
      setImportMarkdown('');
    }
  };

  const handleImportInputChange = (value: string) => {
    setImportInput(value);
    const rows = parseRows(value);
    const markdown = buildMarkdown(rows);
    setImportMarkdown(markdown);
  };

  const handlePickDirectory = async () => {
    const path = await window.desktopAPI.pickDirectory();
    if (path) {
      await saveSettings({ ...settings, saveDirectory: path });
    }
  };

  const refreshLibraryFolder = async (folderPath: string) => {
    const result = librarySearch
      ? await window.desktopAPI.searchInDirectory(folderPath, librarySearch)
      : await window.desktopAPI.listDirectory(folderPath);
    setLibraryFiles(result.files);
    setLibraryTree((prev) => ({ ...prev, [folderPath]: result.folders }));
  };

  const openLibraryForScene = async (sceneId: string | null) => {
    setShowLibrary(true);
    setLibraryAddMode(false);
    setLibraryTargetSceneId(sceneId);
    setLibraryHint('Mẹo: Chọn thư mục theo chủ đề (dao, súng, đường phố…) rồi gán ảnh vào cảnh.');
    setLibrarySearch('');
    setSelectedLibraryFile(null);
    setExpandedFolders(new Set(settings.libraryRoots));
    if (!selectedFolder && settings.libraryRoots.length > 0) {
      setSelectedFolder(settings.libraryRoots[0]);
      await refreshLibraryFolder(settings.libraryRoots[0]);
    } else if (selectedFolder) {
      await refreshLibraryFolder(selectedFolder);
    }
  };

  const handleSelectFolder = async (folderPath: string) => {
    setSelectedFolder(folderPath);
    setSelectedLibraryFile(null);
    await refreshLibraryFolder(folderPath);
  };

  const toggleFolderExpand = async (folderPath: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderPath)) {
        next.delete(folderPath);
      } else {
        next.add(folderPath);
      }
      return next;
    });
    const result = await window.desktopAPI.listDirectory(folderPath);
    setLibraryTree((prev) => ({ ...prev, [folderPath]: result.folders }));
  };

  const handleLibrarySearch = async (value: string) => {
    setLibrarySearch(value);
    setSelectedLibraryFile(null);
    if (selectedFolder) {
      const result = value
        ? await window.desktopAPI.searchInDirectory(selectedFolder, value)
        : await window.desktopAPI.listDirectory(selectedFolder);
      setLibraryFiles(result.files);
      setLibraryTree((prev) => ({ ...prev, [selectedFolder]: result.folders }));
    }
  };

  const openLibraryForAdd = async () => {
    setShowLibrary(true);
    setLibraryAddMode(true);
    setLibraryTargetSceneId(null);
    setLibraryHint('Mẹo: Chọn thư mục theo chủ đề (dao, súng, đường phố…) rồi gán ảnh vào cảnh.');
    setLibrarySearch('');
    setSelectedLibraryFile(null);
    setExpandedFolders(new Set(settings.libraryRoots));
    if (!selectedFolder && settings.libraryRoots.length > 0) {
      setSelectedFolder(settings.libraryRoots[0]);
      await refreshLibraryFolder(settings.libraryRoots[0]);
    } else if (selectedFolder) {
      await refreshLibraryFolder(selectedFolder);
    }
  };

  const handleAttachLibraryFile = async () => {
    if (!selectedLibraryFile || !libraryTargetSceneId) return;
    await updateSceneField(libraryTargetSceneId, { primaryImagePath: selectedLibraryFile.fullPath });
    setShowLibrary(false);
    setSelectedLibraryFile(null);
  };

  const handleAddLibraryRoot = async (path: string) => {
    if (!path.trim()) return;
    const nextRoots = Array.from(new Set([...settings.libraryRoots, path.trim()]));
    await saveSettings({ ...settings, libraryRoots: nextRoots });
    setLibraryRootDraft('');
  };

  const handleRemoveLibraryRoot = async (path: string) => {
    const nextRoots = settings.libraryRoots.filter((root) => root !== path);
    await saveSettings({ ...settings, libraryRoots: nextRoots });
    if (selectedFolder === path) {
      setSelectedFolder(null);
      setLibraryFiles([]);
    }
  };

  const handleExport = async (isAuto = false) => {
    let directory = settings.saveDirectory;
    if (!directory) {
      const picked = await window.desktopAPI.pickDirectory();
      if (!picked) return;
      directory = picked;
      await saveSettings({ ...settings, saveDirectory: picked });
    }
    setExportStatus({ state: 'saving', message: 'Đang lưu...' });
    try {
      const buffer = await generateExportZip(scenes, setExportWarnings);
      await window.desktopAPI.writeFile(directory, 'STORYBOARD_EXPORT.zip', buffer);
      const now = Date.now();
      const time = new Date(now).toLocaleTimeString('vi-VN');
      setExportStatus({ state: 'saved', message: `Đã lưu lúc ${time}` });
      if (!isAuto) {
        await saveSettings({ ...settings, lastSavedAt: now });
      }
    } catch (error) {
      setExportStatus({ state: 'error', message: `Lỗi lưu: ${(error as Error).message}` });
    }
  };

  const handleDropImage = async (sceneId: string, files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    const buffer = await file.arrayBuffer();
    const ext = getImageExtension(file.type, file.name);
    const updated = await window.desktopAPI.attachSceneImage(sceneId, buffer, ext);
    setScenes((prev) => prev.map((scene) => (scene.id === updated.id ? updated : scene)));
    triggerAutosave();
  };

  const handleFilePick = (sceneId: string) => {
    fileSceneIdRef.current = sceneId;
    fileInputRef.current?.click();
  };

  const handleFileInputChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const sceneId = fileSceneIdRef.current;
    if (!sceneId) return;
    await handleDropImage(sceneId, event.target.files);
    event.target.value = '';
  };

  const handleLibraryFilePick = () => {
    libraryFileInputRef.current?.click();
  };

  const handleLibraryFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const folderPath = selectedFolder;
    if (!folderPath || !event.target.files || event.target.files.length === 0) return;
    const file = event.target.files[0] as File & { path?: string };
    if (!file.path) return;
    await window.desktopAPI.copyFileToFolder(file.path, folderPath);
    await refreshLibraryFolder(folderPath);
    event.target.value = '';
  };

  const handleLibraryPaste = async (event: React.ClipboardEvent<HTMLDivElement>) => {
    const folderPath = selectedFolder;
    if (!folderPath) return;
    const items = event.clipboardData?.items ?? [];
    for (const item of items) {
      if (!item.type.startsWith('image/')) continue;
      const file = item.getAsFile();
      if (!file) continue;
      const buffer = await file.arrayBuffer();
      const ext = getImageExtension(file.type, file.name);
      await window.desktopAPI.saveClipboardImageToFolder(folderPath, buffer, ext);
      await refreshLibraryFolder(folderPath);
    }
  };

  const handleToggleCharacter = async (sceneId: string, value: boolean) => {
    const updated = await window.desktopAPI.toggleCharacter(sceneId, value);
    setScenes((prev) => prev.map((scene) => (scene.id === updated.id ? updated : scene)));
    triggerAutosave();
  };

  const filteredScenes = scenes.filter((scene) => {
    const query = search.toLowerCase();
    return (
      scene.code.toLowerCase().includes(query) ||
      scene.enText.toLowerCase().includes(query) ||
      scene.viText.toLowerCase().includes(query) ||
      scene.keywords.toLowerCase().includes(query)
    );
  });

  const renderFolderNode = (folderPath: string, depth = 0) => {
    const children = libraryTree[folderPath] ?? [];
    const isExpanded = expandedFolders.has(folderPath);
    return (
      <div key={folderPath} className="space-y-1">
        <div
          className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm ${
            selectedFolder === folderPath ? 'bg-indigo-500/20 text-white' : 'text-indigo-200'
          }`}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
          onClick={() => handleSelectFolder(folderPath)}
        >
          <button
            onClick={(event) => {
              event.stopPropagation();
              toggleFolderExpand(folderPath);
            }}
            className="text-xs text-indigo-300 hover:text-white"
            type="button"
          >
            {isExpanded ? '▾' : '▸'}
          </button>
          <span className="truncate">{folderPath.split(/[\\/]/).pop()}</span>
        </div>
        {isExpanded &&
          children.map((child) => (
            <div key={child.fullPath}>{renderFolderNode(child.fullPath, depth + 1)}</div>
          ))}
      </div>
    );
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (mtime: number) => new Date(mtime).toLocaleDateString('vi-VN');

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="neon-panel px-6 py-5 shadow-glow">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-white">STORYBOARD BY DAVIDDUNG</h1>
            <p className="text-sm text-indigo-200">{motivationalLine}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Tìm kiếm..."
              className="rounded-lg border border-indigo-500/30 bg-slate-900/70 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              onClick={() => setShowImport(true)}
              className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white shadow-glow transition hover:bg-indigo-400"
            >
              Nhập dữ liệu
            </button>
            <button
              onClick={() => openLibraryForScene(selectedSceneId)}
              className="rounded-lg border border-indigo-400 px-4 py-2 text-sm font-semibold text-indigo-100 hover:bg-indigo-500/20"
            >
              Kho Footage
            </button>
            <button
              onClick={openLibraryForAdd}
              className="rounded-lg border border-indigo-400 px-4 py-2 text-sm font-semibold text-indigo-100 hover:bg-indigo-500/20"
            >
              Thêm hình ảnh vào kho footage
            </button>
            <button
              onClick={() => handleExport(false)}
              className="rounded-lg border border-indigo-400 px-4 py-2 text-sm font-semibold text-indigo-100 hover:bg-indigo-500/20"
            >
              Xuất bản
            </button>
            <button
              onClick={() => setShowSettings(true)}
              className="rounded-lg border border-indigo-400 px-4 py-2 text-sm font-semibold text-indigo-100 hover:bg-indigo-500/20"
            >
              Cài đặt
            </button>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-4 rounded-lg border border-indigo-500/20 bg-slate-900/70 px-4 py-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.autosaveEnabled}
              onChange={async (event) => saveSettings({ ...settings, autosaveEnabled: event.target.checked })}
              className="h-4 w-4 rounded border-indigo-500 bg-slate-800 text-indigo-500"
            />
            Tự động lưu
          </label>
          <input
            value={settings.saveDirectory}
            onChange={async (event) => saveSettings({ ...settings, saveDirectory: event.target.value })}
            placeholder="Đường dẫn lưu"
            className="flex-1 rounded-lg border border-indigo-500/30 bg-slate-900/70 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            onClick={handlePickDirectory}
            className="rounded-lg border border-indigo-400 px-3 py-2 text-sm text-indigo-100 hover:bg-indigo-500/20"
          >
            Chọn...
          </button>
          <button
            onClick={() => settings.saveDirectory && window.desktopAPI.openInExplorer(settings.saveDirectory)}
            className="rounded-lg border border-indigo-400 px-3 py-2 text-sm text-indigo-100 hover:bg-indigo-500/20"
            title="Mở thư mục"
          >
            📂
          </button>
          <span className="text-sm text-indigo-200">{exportStatus.message}</span>
          {exportWarnings.length > 0 && (
            <span className="text-xs text-amber-300">
              Thiếu {exportWarnings.length} tệp ảnh trong lần xuất gần nhất.
            </span>
          )}
        </div>
      </header>

      <main className="px-6 py-6">
        {exportWarnings.length > 0 && (
          <div className="mb-4 rounded-xl border border-amber-400/40 bg-amber-500/10 p-4 text-sm text-amber-200">
            <p className="font-semibold">Cảnh báo xuất bản</p>
            <p className="text-xs text-amber-200">
              Một số file hình ảnh bị mất liên kết và không được thêm vào file ZIP:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
              {exportWarnings.slice(0, 5).map((path) => (
                <li key={path} className="truncate">
                  {path}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="overflow-auto rounded-xl border border-indigo-500/20">
          <table className="w-full min-w-[1200px] border-collapse text-sm">
            <thead className="bg-slate-900/80 text-indigo-200">
              <tr>
                <th className="p-3 text-left">STT</th>
                <th className="p-3 text-left">TIẾNG ANH</th>
                <th className="p-3 text-left">TIẾNG VIỆT</th>
                <th className="p-3 text-left">TỪ KHÓA</th>
                <th className="p-3 text-left">HÌNH ẢNH</th>
                <th className="p-3 text-left">ẢNH NHÂN VẬT</th>
                <th className="p-3 text-left">TRẠNG THÁI</th>
              </tr>
            </thead>
            <tbody>
              {filteredScenes.map((scene, index) => (
                <tr
                  key={scene.id}
                  onClick={() => setSelectedSceneId(scene.id)}
                  className={`border-b border-indigo-500/10 align-top transition hover:bg-indigo-500/10 ${
                    selectedSceneId === scene.id ? 'bg-indigo-500/20' : ''
                  }`}
                >
                  <td className="p-3 text-indigo-200">{scene.code || index + 1}</td>
                  <td className="p-3">
                    <textarea
                      value={scene.enText}
                      onChange={(event) => updateSceneField(scene.id, { enText: event.target.value })}
                      className="h-20 w-full resize-none rounded-lg border border-indigo-500/20 bg-slate-900/60 p-2 text-sm text-white"
                    />
                  </td>
                  <td className="p-3">
                    <textarea
                      value={scene.viText}
                      onChange={(event) => updateSceneField(scene.id, { viText: event.target.value })}
                      className="h-20 w-full resize-none rounded-lg border border-indigo-500/20 bg-slate-900/60 p-2 text-sm text-white"
                    />
                  </td>
                  <td className="p-3">
                    <textarea
                      value={scene.keywords}
                      onChange={(event) => updateSceneField(scene.id, { keywords: event.target.value })}
                      className="h-20 w-full resize-none rounded-lg border border-indigo-500/20 bg-slate-900/60 p-2 text-sm text-white"
                    />
                  </td>
                  <td className="p-3">
                    <div className="space-y-2">
                      <div
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => {
                          event.preventDefault();
                          handleDropImage(scene.id, event.dataTransfer.files);
                        }}
                        onClick={() => handleFilePick(scene.id)}
                        className="flex h-28 w-48 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-indigo-400/40 bg-slate-900/50 text-center text-xs text-indigo-200 transition hover:border-indigo-300"
                      >
                        {scene.primaryImagePath && !missingLinks[scene.id] ? (
                          <img
                            src={`file://${scene.primaryImagePath}`}
                            alt="scene"
                            className="h-full w-full rounded-md object-cover"
                          />
                        ) : (
                          <span>Dán (Ctrl+V), kéo thả hoặc nhấn để tải ảnh</span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <button
                          onClick={() => openLibraryForScene(scene.id)}
                          className="rounded-md border border-indigo-400 px-2 py-1 text-indigo-100 hover:bg-indigo-500/20"
                        >
                          Chọn từ kho
                        </button>
                        {missingLinks[scene.id] && (
                          <span className="rounded-full bg-rose-500/20 px-2 py-1 text-rose-200">
                            Mất liên kết
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="p-3">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={scene.characterImage}
                        onChange={(event) => handleToggleCharacter(scene.id, event.target.checked)}
                        className="h-4 w-4 rounded border-indigo-500 bg-slate-800 text-indigo-500"
                      />
                      Ảnh nhân vật
                    </label>
                  </td>
                  <td className="p-3">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        scene.primaryImagePath && !missingLinks[scene.id]
                          ? 'bg-emerald-500/20 text-emerald-200'
                          : 'bg-amber-500/20 text-amber-200'
                      }`}
                    >
                      {scene.primaryImagePath && !missingLinks[scene.id] ? 'SẴN SÀNG' : 'ĐANG CHỜ'}
                    </span>
                  </td>
                </tr>
              ))}
              {filteredScenes.length === 0 && (
                <tr>
                  <td className="p-6 text-center text-indigo-200" colSpan={7}>
                    Chưa có cảnh nào. Hãy nhập dữ liệu hoặc tạo mới.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>

      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6">
          <div className="neon-panel w-full max-w-3xl rounded-2xl p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-white">Cài đặt kho footage</h2>
              <button onClick={() => setShowSettings(false)} className="text-indigo-200 hover:text-white">
                Đóng
              </button>
            </div>
            <p className="mt-2 text-sm text-indigo-200">
              Quản lý các thư mục gốc của kho footage để duyệt nhanh theo chủ đề.
            </p>
            <div className="mt-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={libraryRootDraft}
                  onChange={(event) => setLibraryRootDraft(event.target.value)}
                  placeholder="Nhập đường dẫn thư mục..."
                  className="flex-1 rounded-lg border border-indigo-500/30 bg-slate-900/70 px-3 py-2 text-sm text-white"
                />
                <button
                  onClick={() => handleAddLibraryRoot(libraryRootDraft)}
                  className="rounded-lg border border-indigo-400 px-3 py-2 text-sm text-indigo-100 hover:bg-indigo-500/20"
                >
                  Thêm thủ công
                </button>
                <button
                  onClick={async () => {
                    const path = await window.desktopAPI.pickDirectory();
                    if (path) await handleAddLibraryRoot(path);
                  }}
                  className="rounded-lg border border-indigo-400 px-3 py-2 text-sm text-indigo-100 hover:bg-indigo-500/20"
                >
                  Chọn thư mục...
                </button>
              </div>
              <div className="rounded-lg border border-indigo-500/20 bg-slate-900/60 p-3">
                {settings.libraryRoots.length === 0 && (
                  <p className="text-sm text-indigo-200">Chưa có thư mục gốc nào được thêm.</p>
                )}
                <ul className="space-y-2">
                  {settings.libraryRoots.map((root) => (
                    <li key={root} className="flex items-center justify-between text-sm text-indigo-100">
                      <span className="truncate">{root}</span>
                      <button
                        onClick={() => handleRemoveLibraryRoot(root)}
                        className="rounded-md border border-rose-400 px-2 py-1 text-rose-200 hover:bg-rose-500/20"
                      >
                        Xóa
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {showLibrary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
          <div
            className="neon-panel flex w-full max-w-6xl flex-col gap-4 rounded-2xl p-6"
            onPaste={handleLibraryPaste}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-white">Kho Footage</h2>
                <p className="text-sm text-indigo-200">{libraryHint}</p>
              </div>
              <button onClick={() => setShowLibrary(false)} className="text-indigo-200 hover:text-white">
                Đóng
              </button>
            </div>
            <div className="grid gap-4 lg:grid-cols-[280px,1fr]">
              <div className="rounded-lg border border-indigo-500/20 bg-slate-900/70 p-3">
                <h3 className="text-sm font-semibold text-indigo-200">Thư mục gốc</h3>
                <div className="mt-3 space-y-1">
                  {settings.libraryRoots.map((root) => renderFolderNode(root))}
                </div>
                {settings.libraryRoots.length === 0 && (
                  <p className="mt-3 text-xs text-indigo-300">Vui lòng thêm thư mục gốc trong phần Cài đặt.</p>
                )}
              </div>
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    value={librarySearch}
                    onChange={(event) => handleLibrarySearch(event.target.value)}
                    placeholder="Tìm kiếm filename..."
                    className="flex-1 rounded-lg border border-indigo-500/30 bg-slate-900/70 px-3 py-2 text-sm text-white"
                  />
                  <button
                    onClick={() => selectedFolder && refreshLibraryFolder(selectedFolder)}
                    className="rounded-lg border border-indigo-400 px-3 py-2 text-sm text-indigo-100 hover:bg-indigo-500/20"
                  >
                    Làm mới
                  </button>
                </div>
                {selectedFolder && (
                  <div className="rounded-lg border border-indigo-500/20 bg-slate-900/60 p-3 text-xs text-indigo-200">
                    Đang xem: <span className="text-indigo-100">{selectedFolder}</span>
                  </div>
                )}
                <div className="grid gap-3 rounded-lg border border-indigo-500/20 bg-slate-900/60 p-3 md:grid-cols-3">
                  {libraryFiles.filter((file) => file.type !== 'other').map((file) => (
                    <div
                      key={file.fullPath}
                      onClick={() => setSelectedLibraryFile(file)}
                      className={`group cursor-pointer rounded-lg border p-2 text-xs transition ${
                        selectedLibraryFile?.fullPath === file.fullPath
                          ? 'border-indigo-400 bg-indigo-500/20'
                          : 'border-indigo-500/20 bg-slate-900/70 hover:border-indigo-400/60'
                      }`}
                    >
                      {file.type === 'image' ? (
                        <img
                          src={`file://${file.fullPath}`}
                          alt={file.name}
                          className="h-24 w-full rounded-md object-cover"
                        />
                      ) : (
                        <div className="flex h-24 items-center justify-center rounded-md bg-slate-950 text-indigo-200">
                          {file.type === 'video' ? '🎬 Video' : '📄 File'}
                        </div>
                      )}
                      <div className="mt-2 space-y-1 text-indigo-100">
                        <p className="truncate">{file.name}</p>
                        <p className="text-[10px] text-indigo-300">
                          {formatSize(file.size)} · {formatDate(file.mtime)}
                        </p>
                      </div>
                    </div>
                  ))}
                  {libraryFiles.length === 0 && (
                    <p className="text-sm text-indigo-200">Không có file phù hợp trong thư mục này.</p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={handleAttachLibraryFile}
                    disabled={!selectedLibraryFile || selectedLibraryFile.type !== 'image' || !libraryTargetSceneId}
                    className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white shadow-glow transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Gán vào cảnh
                  </button>
                  <button
                    onClick={() => selectedLibraryFile && window.desktopAPI.openInExplorer(selectedLibraryFile.fullPath)}
                    disabled={!selectedLibraryFile}
                    className="rounded-lg border border-indigo-400 px-4 py-2 text-sm text-indigo-100 hover:bg-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Mở vị trí file
                  </button>
                </div>
                {libraryAddMode && (
                  <div className="rounded-lg border border-indigo-500/30 bg-slate-900/70 p-4 text-sm text-indigo-200">
                    <p className="font-semibold text-indigo-100">Thêm hình ảnh vào kho footage</p>
                    <p className="mt-1 text-xs">
                      Chọn thư mục đích ở panel trái, sau đó chọn file hoặc dán (Ctrl+V) để lưu.
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <button
                        onClick={handleLibraryFilePick}
                        disabled={!selectedFolder}
                        className="rounded-lg border border-indigo-400 px-3 py-2 text-xs text-indigo-100 hover:bg-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Chọn file ảnh...
                      </button>
                      <span className="text-xs text-indigo-300">
                        {selectedFolder ? 'Sẵn sàng dán ảnh từ clipboard.' : 'Chọn thư mục trước.'}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6">
          <div className="neon-panel w-full max-w-6xl rounded-2xl p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-white">Nhập dữ liệu từ Google Sheets</h2>
              <button
                onClick={() => setShowImport(false)}
                className="text-indigo-200 hover:text-white"
              >
                Đóng
              </button>
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm text-indigo-200">Dữ liệu gốc</label>
                <textarea
                  value={importInput}
                  onChange={(event) => handleImportInputChange(event.target.value)}
                  onPaste={handleImportPaste}
                  className="h-80 w-full resize-none rounded-lg border border-indigo-500/20 bg-slate-900/70 p-3 text-sm text-white"
                  placeholder="Dán dữ liệu từ Google Sheets vào đây..."
                />
              </div>
              <div>
                <label className="mb-2 block text-sm text-indigo-200">Markdown Preview</label>
                <textarea
                  value={importMarkdown}
                  readOnly
                  className="h-80 w-full resize-none rounded-lg border border-indigo-500/20 bg-slate-900/70 p-3 text-sm text-white"
                />
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                onClick={async () => {
                  await navigator.clipboard.writeText(importMarkdown);
                }}
                className="rounded-lg border border-indigo-400 px-4 py-2 text-sm text-indigo-100 hover:bg-indigo-500/20"
              >
                Copy Markdown
              </button>
              <button
                onClick={applyImport}
                className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white shadow-glow hover:bg-indigo-400"
              >
                Áp dụng vào Bảng sản xuất
              </button>
            </div>
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileInputChange}
      />
      <input
        ref={libraryFileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleLibraryFileChange}
      />
    </div>
  );
};

export default App;
