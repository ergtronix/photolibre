import { useEffect, useRef, useState } from "react";

import { AlbumList } from "./components/AlbumList";
import { ArchivePicker } from "./components/ArchivePicker";
import { FilterBar } from "./components/FilterBar";
import { Lightbox } from "./components/Lightbox";
import { PhotoGrid } from "./components/PhotoGrid";
import { SearchBox } from "./components/SearchBox";
import {
  addPhotosToAlbum,
  countUnfiledPhotos,
  createAlbum,
  deleteViewerAlbum,
  getArchivePath,
  listAlbumPhotos,
  listAlbums,
  listPhotos,
  listUnfiledPhotos,
  pickAndSetArchivePath,
  removePhotoFromAlbum,
  renameAlbum,
  searchPhotos,
  unfilePhotos,
} from "./lib/api";
import { EMPTY_FILTER } from "./lib/types";
import type { Album, AlbumSelection, Photo, PhotoFilter } from "./lib/types";
import { useUndoStack } from "./lib/useUndoStack";
import "./App.css";

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

export default function App() {
  const [archivePath, setArchivePathState] = useState<string | null>(null);
  const [checkingArchive, setCheckingArchive] = useState(true);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [unfiledCount, setUnfiledCount] = useState(0);
  const [selection, setSelection] = useState<AlbumSelection>({ kind: "all" });
  const [filter, setFilter] = useState<PhotoFilter>(EMPTY_FILTER);
  const [searchQuery, setSearchQuery] = useState<string | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<Set<string>>(new Set());
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [photoVersions, setPhotoVersions] = useState<Record<string, number>>({});
  const undoStack = useUndoStack();

  // Undoのやり直し処理は「今どのビューを見ているか」を常に最新の値で
  // 参照する必要があるため（分類操作の直後だけでなく、別のビューへ移動した
  // 後にCtrl+Zされる可能性もある）、refで最新値を追随させる。
  const viewStateRef = useRef({ selection, searchQuery, filter });
  useEffect(() => {
    viewStateRef.current = { selection, searchQuery, filter };
  }, [selection, searchQuery, filter]);

  useEffect(() => {
    getArchivePath()
      .then((path) => setArchivePathState(path))
      .finally(() => setCheckingArchive(false));
  }, []);

  useEffect(() => {
    if (!archivePath) {
      return;
    }
    let cancelled = false;
    Promise.all([listAlbums(), countUnfiledPhotos()]).then(([albumList, unfiled]) => {
      if (!cancelled) {
        setAlbums(albumList);
        setUnfiledCount(unfiled);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [archivePath]);

  useEffect(() => {
    if (!archivePath) {
      return;
    }
    setSelectedPhotoIds(new Set());
    let cancelled = false;
    const applyResult = (result: Photo[]) => {
      if (!cancelled) {
        setPhotos(result);
      }
    };

    if (searchQuery !== null) {
      searchPhotos(searchQuery).then(applyResult);
    } else if (selection.kind === "unfiled") {
      listUnfiledPhotos().then(applyResult);
    } else if (selection.kind === "album") {
      listAlbumPhotos(selection.albumId).then(applyResult);
    } else {
      listPhotos(filter).then(applyResult);
    }

    return () => {
      cancelled = true;
    };
  }, [archivePath, selection, filter, searchQuery]);

  // Ctrl+Z（分類操作のUndo）。検索欄・アルバム名編集欄など、テキスト入力中は
  // ブラウザ標準のUndoに任せるため、編集可能要素にフォーカスがある間は無視する。
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) {
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        undoStack.undo();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undoStack.undo]);

  if (checkingArchive) {
    return <div className="app-loading">読み込み中...</div>;
  }

  if (!archivePath) {
    return <ArchivePicker onSelected={setArchivePathState} />;
  }

  const refreshSidebar = async () => {
    const [albumList, unfiled] = await Promise.all([listAlbums(), countUnfiledPhotos()]);
    setAlbums(albumList);
    setUnfiledCount(unfiled);
  };

  const reloadCurrentPhotos = async () => {
    const current = viewStateRef.current;
    if (current.searchQuery !== null) {
      setPhotos(await searchPhotos(current.searchQuery));
    } else if (current.selection.kind === "unfiled") {
      setPhotos(await listUnfiledPhotos());
    } else if (current.selection.kind === "album") {
      setPhotos(await listAlbumPhotos(current.selection.albumId));
    } else {
      setPhotos(await listPhotos(current.filter));
    }
  };

  const handleChangeArchive = async () => {
    const selected = await pickAndSetArchivePath();
    if (!selected) {
      return;
    }
    setArchivePathState(selected);
    setSelection({ kind: "all" });
    setFilter(EMPTY_FILTER);
    setSearchQuery(null);
    setPhotoVersions({});
    setLightboxIndex(null);
    setSelectedPhotoIds(new Set());
  };

  const handleToggleSelectPhoto = (photoId: string) => {
    setSelectedPhotoIds((prev) => {
      const next = new Set(prev);
      if (next.has(photoId)) {
        next.delete(photoId);
      } else {
        next.add(photoId);
      }
      return next;
    });
  };

  const handleCreateAlbum = async (name: string) => {
    const album = await createAlbum(name);
    await refreshSidebar();
    undoStack.push({
      label: `アルバム「${name}」の作成を取り消す`,
      undo: async () => {
        await deleteViewerAlbum(album.id);
        await refreshSidebar();
        setSelection((current) =>
          current.kind === "album" && current.albumId === album.id ? { kind: "all" } : current
        );
      },
    });
  };

  const handleRenameAlbum = async (albumId: string, newName: string) => {
    const previous = albums.find((album) => album.id === albumId);
    if (!previous) {
      return;
    }
    await renameAlbum(albumId, newName);
    await refreshSidebar();
    undoStack.push({
      label: `アルバム名を「${previous.name}」に戻す`,
      undo: async () => {
        await renameAlbum(albumId, previous.name);
        await refreshSidebar();
      },
    });
  };

  const handleDropPhotosOnAlbum = async (albumId: string, photoIds: string[]) => {
    if (photoIds.length === 0) {
      return;
    }
    await addPhotosToAlbum(albumId, photoIds);
    setSelectedPhotoIds(new Set());
    await refreshSidebar();
    await reloadCurrentPhotos();
    undoStack.push({
      label: "アルバムへの追加を取り消す",
      undo: async () => {
        await Promise.all(photoIds.map((photoId) => removePhotoFromAlbum(albumId, photoId)));
        await refreshSidebar();
        await reloadCurrentPhotos();
      },
    });
  };

  const handleDropPhotosOnUnfiled = async (photoIds: string[]) => {
    if (photoIds.length === 0) {
      return;
    }
    const previousAlbumsByPhoto = await unfilePhotos(photoIds);
    setSelectedPhotoIds(new Set());
    await refreshSidebar();
    await reloadCurrentPhotos();
    undoStack.push({
      label: "未分類への移動を取り消す",
      undo: async () => {
        await Promise.all(
          Object.entries(previousAlbumsByPhoto).flatMap(([photoId, albumIds]) =>
            albumIds.map((albumId) => addPhotosToAlbum(albumId, [photoId]))
          )
        );
        await refreshSidebar();
        await reloadCurrentPhotos();
      },
    });
  };

  const handleRemoveSelectedFromAlbum = async () => {
    if (selection.kind !== "album" || selectedPhotoIds.size === 0) {
      return;
    }
    const albumId = selection.albumId;
    const photoIds = Array.from(selectedPhotoIds);
    await Promise.all(photoIds.map((photoId) => removePhotoFromAlbum(albumId, photoId)));
    setSelectedPhotoIds(new Set());
    await refreshSidebar();
    await reloadCurrentPhotos();
    undoStack.push({
      label: "アルバムから外した写真を戻す",
      undo: async () => {
        await addPhotosToAlbum(albumId, photoIds);
        await refreshSidebar();
        await reloadCurrentPhotos();
      },
    });
  };

  return (
    <div className="app">
      <aside className="app__sidebar">
        <button type="button" className="app__change-archive" onClick={handleChangeArchive}>
          アーカイブフォルダを変更
        </button>
        <AlbumList
          albums={albums}
          unfiledCount={unfiledCount}
          selection={selection}
          onSelect={(next) => {
            setSelection(next);
            setSearchQuery(null);
          }}
          onCreateAlbum={handleCreateAlbum}
          onRenameAlbum={handleRenameAlbum}
          onDropPhotos={handleDropPhotosOnAlbum}
          onDropUnfiled={handleDropPhotosOnUnfiled}
        />
      </aside>

      <main className="app__main">
        <div className="app__toolbar">
          <SearchBox
            onSearch={(query) => {
              setSearchQuery(query);
              setSelection({ kind: "all" });
            }}
            onClear={() => setSearchQuery(null)}
          />
          {searchQuery === null && selection.kind === "all" && (
            <FilterBar filter={filter} onChange={setFilter} />
          )}
        </div>

        {selection.kind === "album" && selectedPhotoIds.size > 0 && (
          <div className="app__selection-toolbar">
            <span>{selectedPhotoIds.size}件選択中</span>
            <button type="button" onClick={handleRemoveSelectedFromAlbum}>
              アルバムから外す
            </button>
            <button type="button" onClick={() => setSelectedPhotoIds(new Set())}>
              選択解除
            </button>
          </div>
        )}

        <PhotoGrid
          photos={photos}
          onSelect={setLightboxIndex}
          photoVersions={photoVersions}
          selectedPhotoIds={selectedPhotoIds}
          onToggleSelect={handleToggleSelectPhoto}
        />
      </main>

      {lightboxIndex !== null && (
        <Lightbox
          photos={photos}
          currentIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
          onRotated={(photoId) =>
            setPhotoVersions((versions) => ({
              ...versions,
              [photoId]: (versions[photoId] ?? 0) + 1,
            }))
          }
        />
      )}
    </div>
  );
}
