import { useState, type FormEvent } from "react";

interface SearchBoxProps {
  onSearch: (query: string) => void;
  onClear: () => void;
}

export function SearchBox({ onSearch, onClear }: SearchBoxProps) {
  const [value, setValue] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = value.trim();
    if (trimmed === "") {
      onClear();
      return;
    }
    onSearch(trimmed);
  };

  const handleClear = () => {
    setValue("");
    onClear();
  };

  return (
    <form className="search-box" onSubmit={handleSubmit} role="search">
      <label>
        検索
        <input
          type="search"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="ファイル名・タイトル・説明・アルバム名で検索"
        />
      </label>
      <button type="submit">検索</button>
      {value !== "" && (
        <button type="button" onClick={handleClear}>
          クリア
        </button>
      )}
    </form>
  );
}
