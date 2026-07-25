import { useRef, useState } from "react";
import type { KeyboardEvent } from "react";

import { decodePhotoIds, PHOTO_IDS_MIME } from "../lib/dnd";
import type { Album, AlbumSelection } from "../lib/types";

interface AlbumListProps {
  albums: Album[];
  unfiledCount: number;
  selection: AlbumSelection;
  onSelect: (selection: AlbumSelection) => void;
  onCreateAlbum: (name: string) => void;
  onRenameAlbum: (albumId: string, newName: string) => void;
  onDropPhotos: (albumId: string, photoIds: string[]) => void;
  /** 写真を未分類へ移動する（すべてのアルバムから外す）。入れ替え作業のため
   * 一時的に未分類へ戻したいという要望により、"未分類"項目もドロップ対象にする。 */
  onDropUnfiled: (photoIds: string[]) => void;
}

export function AlbumList({
  albums,
  unfiledCount,
  selection,
  onSelect,
  onCreateAlbum,
  onRenameAlbum,
  onDropPhotos,
  onDropUnfiled,
}: AlbumListProps) {
  const [editingAlbumId, setEditingAlbumId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const skipEditBlur = useRef(false);
  const [dragOverAlbumId, setDragOverAlbumId] = useState<string | null>(null);
  const [isUnfiledDragOver, setIsUnfiledDragOver] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newAlbumName, setNewAlbumName] = useState("");
  const skipCreateBlur = useRef(false);

  const startEditing = (album: Album) => {
    setEditingAlbumId(album.id);
    setEditingName(album.name);
  };

  const commitEditing = () => {
    const trimmed = editingName.trim();
    if (editingAlbumId && trimmed) {
      onRenameAlbum(editingAlbumId, trimmed);
    }
    setEditingAlbumId(null);
  };

  const handleEditKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      commitEditing();
    } else if (event.key === "Escape") {
      skipEditBlur.current = true;
      setEditingAlbumId(null);
    }
  };

  const handleEditBlur = () => {
    if (skipEditBlur.current) {
      skipEditBlur.current = false;
      return;
    }
    commitEditing();
  };

  const submitNewAlbum = () => {
    const trimmed = newAlbumName.trim();
    if (trimmed) {
      onCreateAlbum(trimmed);
    }
    setNewAlbumName("");
    setCreating(false);
  };

  const handleCreateKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      submitNewAlbum();
    } else if (event.key === "Escape") {
      skipCreateBlur.current = true;
      setNewAlbumName("");
      setCreating(false);
    }
  };

  const handleCreateBlur = () => {
    if (skipCreateBlur.current) {
      skipCreateBlur.current = false;
      return;
    }
    submitNewAlbum();
  };

  const handleDrop = (albumId: string) => (event: React.DragEvent<HTMLLIElement>) => {
    event.preventDefault();
    setDragOverAlbumId(null);
    const photoIds = decodePhotoIds(event.dataTransfer.getData(PHOTO_IDS_MIME));
    if (photoIds.length > 0) {
      onDropPhotos(albumId, photoIds);
    }
  };

  const handleDropOnUnfiled = (event: React.DragEvent<HTMLLIElement>) => {
    event.preventDefault();
    setIsUnfiledDragOver(false);
    const photoIds = decodePhotoIds(event.dataTransfer.getData(PHOTO_IDS_MIME));
    if (photoIds.length > 0) {
      onDropUnfiled(photoIds);
    }
  };

  return (
    <nav className="album-list" aria-label="アルバム一覧">
      <ul>
        <li>
          <button
            type="button"
            className={
              selection.kind === "all"
                ? "album-list__item album-list__item--active"
                : "album-list__item"
            }
            onClick={() => onSelect({ kind: "all" })}
          >
            すべての写真
          </button>
        </li>
        <li
          onDragOver={(event) => {
            event.preventDefault();
            setIsUnfiledDragOver(true);
          }}
          onDragLeave={() => setIsUnfiledDragOver(false)}
          onDrop={handleDropOnUnfiled}
        >
          <button
            type="button"
            className={[
              "album-list__item",
              selection.kind === "unfiled" ? "album-list__item--active" : "",
              isUnfiledDragOver ? "album-list__item--drag-over" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={() => onSelect({ kind: "unfiled" })}
          >
            未分類
            <span className="album-list__count">{unfiledCount}</span>
          </button>
        </li>
        {albums.map((album) => {
          const isActive = selection.kind === "album" && selection.albumId === album.id;
          const isDragOver = dragOverAlbumId === album.id;
          const className = ["album-list__item", isActive ? "album-list__item--active" : "", isDragOver ? "album-list__item--drag-over" : ""]
            .filter(Boolean)
            .join(" ");

          return (
            <li
              key={album.id}
              onDragOver={(event) => {
                event.preventDefault();
                setDragOverAlbumId(album.id);
              }}
              onDragLeave={() =>
                setDragOverAlbumId((current) => (current === album.id ? null : current))
              }
              onDrop={handleDrop(album.id)}
            >
              {editingAlbumId === album.id ? (
                <input
                  autoFocus
                  className="album-list__edit-input"
                  value={editingName}
                  onChange={(event) => setEditingName(event.target.value)}
                  onBlur={handleEditBlur}
                  onKeyDown={handleEditKeyDown}
                />
              ) : (
                <button
                  type="button"
                  className={className}
                  onClick={() => onSelect({ kind: "album", albumId: album.id })}
                  onDoubleClick={() => startEditing(album)}
                >
                  {album.name}
                  <span className="album-list__count">{album.photoCount}</span>
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <div className="album-list__create">
        {creating ? (
          <input
            autoFocus
            className="album-list__edit-input"
            placeholder="アルバム名"
            value={newAlbumName}
            onChange={(event) => setNewAlbumName(event.target.value)}
            onBlur={handleCreateBlur}
            onKeyDown={handleCreateKeyDown}
          />
        ) : (
          <button type="button" className="album-list__create-button" onClick={() => setCreating(true)}>
            ＋ 新しいアルバム
          </button>
        )}
      </div>
    </nav>
  );
}
