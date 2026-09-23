import type { ChangeEvent } from "react";

import type { PhotoFilter } from "../lib/types";

interface FilterBarProps {
  filter: PhotoFilter;
  /** 年の選択肢。アーカイブ内の写真のある年（新しい年が先）。 */
  years: number[];
  onChange: (filter: PhotoFilter) => void;
}

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

/** 選択中の年が一覧にない場合（一覧の読み込み前など）でも、選択がずれて
 * 「すべて」に見えないよう、その年を降順の位置に加える。 */
function withSelectedYear(years: number[], selectedYear: number | null): number[] {
  if (selectedYear === null || years.includes(selectedYear)) {
    return years;
  }
  return [...years, selectedYear].sort((a, b) => b - a);
}

export function FilterBar({ filter, years, onChange }: FilterBarProps) {
  const yearOptions = withSelectedYear(years, filter.year);

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
          {yearOptions.map((year) => (
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
