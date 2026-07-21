import type { Album } from "../lib/types";

interface AlbumListProps {
  albums: Album[];
  selectedAlbumId: string | null;
  onSelect: (albumId: string | null) => void;
}

export function AlbumList({ albums, selectedAlbumId, onSelect }: AlbumListProps) {
  return (
    <nav className="album-list" aria-label="アルバム一覧">
      <ul>
        <li>
          <button
            type="button"
            className={selectedAlbumId === null ? "album-list__item album-list__item--active" : "album-list__item"}
            onClick={() => onSelect(null)}
          >
            すべての写真
          </button>
        </li>
        {albums.map((album) => (
          <li key={album.id}>
            <button
              type="button"
              className={
                selectedAlbumId === album.id
                  ? "album-list__item album-list__item--active"
                  : "album-list__item"
              }
              onClick={() => onSelect(album.id)}
            >
              {album.name}
              <span className="album-list__count">{album.photoCount}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
