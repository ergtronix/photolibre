export interface Photo {
  id: string;
  filename: string;
  filepath: string;
  mediaType: string;
  dateTaken: string | null;
  dateAdded: string | null;
  latitude: number | null;
  longitude: number | null;
  favorite: boolean;
  hidden: boolean;
  title: string | null;
  description: string | null;
  width: number | null;
  height: number | null;
  source: string;
}

export interface Album {
  id: string;
  name: string;
  albumType: string;
  source: string;
  photoCount: number;
}

export interface PhotoFilter {
  favoriteOnly: boolean;
  year: number | null;
  month: number | null;
  keyword: string | null;
}

export const EMPTY_FILTER: PhotoFilter = {
  favoriteOnly: false,
  year: null,
  month: null,
  keyword: null,
};
