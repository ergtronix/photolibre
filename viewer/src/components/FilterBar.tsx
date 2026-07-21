import type { ChangeEvent } from "react";

import type { PhotoFilter } from "../lib/types";

interface FilterBarProps {
  filter: PhotoFilter;
  onChange: (filter: PhotoFilter) => void;
}

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const YEARS = Array.from({ length: 40 }, (_, i) => 2026 - i);

export function FilterBar({ filter, onChange }: FilterBarProps) {
  const handleFavoriteChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange({ ...filter, favoriteOnly: event.target.checked });
  };

  const handleYearChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    onChange({ ...filter, year: value === "" ? null : Number(value) });
  };

  const handleMonthChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    onChange({ ...filter, month: value === "" ? null : Number(value) });
  };

  const handleKeywordChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value.trim();
    onChange({ ...filter, keyword: value === "" ? null : value });
  };

  return (
    <div className="filter-bar" role="group" aria-label="絞り込み">
      <label>
        <input type="checkbox" checked={filter.favoriteOnly} onChange={handleFavoriteChange} />
        お気に入りのみ
      </label>

      <label>
        年
        <select value={filter.year ?? ""} onChange={handleYearChange}>
          <option value="">すべて</option>
          {YEARS.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </label>

      <label>
        月
        <select value={filter.month ?? ""} onChange={handleMonthChange}>
          <option value="">すべて</option>
          {MONTHS.map((month) => (
            <option key={month} value={month}>
              {month}
            </option>
          ))}
        </select>
      </label>

      <label>
        キーワード
        <input
          type="text"
          value={filter.keyword ?? ""}
          onChange={handleKeywordChange}
          placeholder="例: 家族旅行"
        />
      </label>
    </div>
  );
}
