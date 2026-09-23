import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { FilterBar } from "./FilterBar";
import { EMPTY_FILTER } from "../lib/types";

const YEARS = [2027, 2026, 2020];

function optionLabels(select: HTMLElement): string[] {
  return within(select)
    .getAllByRole("option")
    .map((option) => option.textContent ?? "");
}

describe("FilterBar", () => {
  it("toggles favoriteOnly when the checkbox is clicked", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<FilterBar filter={EMPTY_FILTER} years={YEARS} onChange={onChange} />);
    await user.click(screen.getByLabelText("お気に入りのみ"));

    expect(onChange).toHaveBeenCalledWith({ ...EMPTY_FILTER, favoriteOnly: true });
  });

  it("updates year when a year is selected", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<FilterBar filter={EMPTY_FILTER} years={YEARS} onChange={onChange} />);
    await user.selectOptions(screen.getByLabelText("年"), "2020");

    expect(onChange).toHaveBeenCalledWith({ ...EMPTY_FILTER, year: 2020 });
  });

  it("builds the year options from the given years, with 'すべて' first", () => {
    render(<FilterBar filter={EMPTY_FILTER} years={YEARS} onChange={vi.fn()} />);

    expect(optionLabels(screen.getByLabelText("年"))).toEqual(["すべて", "2027", "2026", "2020"]);
  });

  it("offers a year that is later than any hard-coded year when the photos contain it", () => {
    render(<FilterBar filter={EMPTY_FILTER} years={[2031]} onChange={vi.fn()} />);

    expect(optionLabels(screen.getByLabelText("年"))).toEqual(["すべて", "2031"]);
  });

  it("shows only 'すべて' in the year select when there are no years", () => {
    render(<FilterBar filter={EMPTY_FILTER} years={[]} onChange={vi.fn()} />);

    expect(optionLabels(screen.getByLabelText("年"))).toEqual(["すべて"]);
  });

  it("does not offer years that are not in the given list", () => {
    render(<FilterBar filter={EMPTY_FILTER} years={[2020]} onChange={vi.fn()} />);

    expect(within(screen.getByLabelText("年")).queryByRole("option", { name: "2026" })).toBeNull();
    expect(within(screen.getByLabelText("年")).queryByRole("option", { name: "1990" })).toBeNull();
  });

  it("keeps the selected year visible even when it is missing from the given years", () => {
    const filterWithYear = { ...EMPTY_FILTER, year: 2024 };

    render(<FilterBar filter={filterWithYear} years={[2027, 2020]} onChange={vi.fn()} />);

    const select = screen.getByLabelText("年") as HTMLSelectElement;
    expect(optionLabels(select)).toEqual(["すべて", "2027", "2024", "2020"]);
    expect(select.value).toBe("2024");
  });

  it("does not duplicate the selected year when it is already in the given years", () => {
    const filterWithYear = { ...EMPTY_FILTER, year: 2026 };

    render(<FilterBar filter={filterWithYear} years={YEARS} onChange={vi.fn()} />);

    expect(optionLabels(screen.getByLabelText("年"))).toEqual(["すべて", "2027", "2026", "2020"]);
  });

  it("does not mutate the given years array", () => {
    const years = [2027, 2020];
    const filterWithYear = { ...EMPTY_FILTER, year: 2024 };

    render(<FilterBar filter={filterWithYear} years={years} onChange={vi.fn()} />);

    expect(years).toEqual([2027, 2020]);
  });

  it("updates month when a month is selected", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<FilterBar filter={EMPTY_FILTER} years={YEARS} onChange={onChange} />);
    await user.selectOptions(screen.getByLabelText("月"), "5");

    expect(onChange).toHaveBeenCalledWith({ ...EMPTY_FILTER, month: 5 });
  });

  it("keeps the month options as 1 to 12 regardless of the years", () => {
    render(<FilterBar filter={EMPTY_FILTER} years={[]} onChange={vi.fn()} />);

    expect(optionLabels(screen.getByLabelText("月"))).toEqual([
      "すべて",
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "10",
      "11",
      "12",
    ]);
  });

  it("updates keyword as free text and trims whitespace to null when empty", () => {
    const onChange = vi.fn();

    render(<FilterBar filter={EMPTY_FILTER} years={YEARS} onChange={onChange} />);
    const input = screen.getByLabelText("キーワード");
    fireEvent.change(input, { target: { value: "家族" } });

    expect(onChange).toHaveBeenLastCalledWith({ ...EMPTY_FILTER, keyword: "家族" });
  });

  it("resets year to null when 'すべて' is selected again", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const filterWithYear = { ...EMPTY_FILTER, year: 2020 };

    render(<FilterBar filter={filterWithYear} years={YEARS} onChange={onChange} />);
    await user.selectOptions(screen.getByLabelText("年"), "");

    expect(onChange).toHaveBeenCalledWith({ ...filterWithYear, year: null });
  });
});
