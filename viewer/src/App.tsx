import { useEffect, useState } from "react";

import { AlbumList } from "./components/AlbumList";
import { ArchivePicker } from "./components/ArchivePicker";
import { FilterBar } from "./components/FilterBar";
import { Lightbox } from "./components/Lightbox";
import { PhotoGrid } from "./components/PhotoGrid";
import { SearchBox } from "./components/SearchBox";
import {
  getArchivePath,
  listAlbumPhotos,
  listAlbums,
  listPhotos,
  pickAndSetArchivePath,
  searchPhotos,
} from "./lib/api";
import { EMPTY_FILTER } from "./lib/types";
import type { Album, Photo, PhotoFilter } from "./lib/types";
import "./App.css";

export default function App() {
  const [archivePath, setArchivePathState] = useState<string | null>(null);
  const [checkingArchive, setCheckingArchive] = useState(true);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(null);
  const [filter, setFilter] = useState<PhotoFilter>(EMPTY_FILTER);
  const [searchQuery, setSearchQuery] = useState<string | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [photoVersions, setPhotoVersions] = useState<Record<string, number>>({});

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
    listAlbums().then((result) => {
      if (!cancelled) {
        setAlbums(result);
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
    let cancelled = false;
    const applyResult = (result: Photo[]) => {
      if (!cancelled) {
        setPhotos(result);
      }
    };

    if (searchQuery !== null) {
      searchPhotos(searchQuery).then(applyResult);
    } else if (selectedAlbumId !== null) {
      listAlbumPhotos(selectedAlbumId).then(applyResult);
    } else {
      listPhotos(filter).then(applyResult);
    }

    return () => {
      cancelled = true;
    };
  }, [archivePath, selectedAlbumId, filter, searchQuery]);

  if (checkingArchive) {
    return <div className="app-loading">読み込み中...</div>;
  }

  if (!archivePath) {
    return <ArchivePicker onSelected={setArchivePathState} />;
  }

  const handleChangeArchive = async () => {
    const selected = await pickAndSetArchivePath();
    if (!selected) {
      return;
    }
    setArchivePathState(selected);
    setSelectedAlbumId(null);
    setFilter(EMPTY_FILTER);
    setSearchQuery(null);
    setPhotoVersions({});
    setLightboxIndex(null);
  };

  return (
    <div className="app">
      <aside className="app__sidebar">
        <button type="button" className="app__change-archive" onClick={handleChangeArchive}>
          アーカイブフォルダを変更
        </button>
        <AlbumList
          albums={albums}
          selectedAlbumId={selectedAlbumId}
          onSelect={(albumId) => {
            setSelectedAlbumId(albumId);
            setSearchQuery(null);
          }}
        />
      </aside>

      <main className="app__main">
        <div className="app__toolbar">
          <SearchBox
            onSearch={(query) => {
              setSearchQuery(query);
              setSelectedAlbumId(null);
            }}
            onClear={() => setSearchQuery(null)}
          />
          {searchQuery === null && selectedAlbumId === null && (
            <FilterBar filter={filter} onChange={setFilter} />
          )}
        </div>

        <PhotoGrid photos={photos} onSelect={setLightboxIndex} photoVersions={photoVersions} />
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
