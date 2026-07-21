import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { FilterBar } from "./FilterBar";
import { EMPTY_FILTER } from "../lib/types";

describe("FilterBar", () => {
  it("toggles favoriteOnly when the checkbox is clicked", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<FilterBar filter={EMPTY_FILTER} onChange={onChange} />);
    await user.click(screen.getByLabelText("お気に入りのみ"));

    expect(onChange).toHaveBeenCalledWith({ ...EMPTY_FILTER, favoriteOnly: true });
  });

  it("updates year when a year is selected", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<FilterBar filter={EMPTY_FILTER} onChange={onChange} />);
    await user.selectOptions(screen.getByLabelText("年"), "2020");

    expect(onChange).toHaveBeenCalledWith({ ...EMPTY_FILTER, year: 2020 });
  });

  it("updates month when a month is selected", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<FilterBar filter={EMPTY_FILTER} onChange={onChange} />);
    await user.selectOptions(screen.getByLabelText("月"), "5");

    expect(onChange).toHaveBeenCalledWith({ ...EMPTY_FILTER, month: 5 });
  });

  it("updates keyword as free text and trims whitespace to null when empty", () => {
    const onChange = vi.fn();

    render(<FilterBar filter={EMPTY_FILTER} onChange={onChange} />);
    const input = screen.getByLabelText("キーワード");
    fireEvent.change(input, { target: { value: "家族" } });

    expect(onChange).toHaveBeenLastCalledWith({ ...EMPTY_FILTER, keyword: "家族" });
  });

  it("resets year to null when 'すべて' is selected again", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const filterWithYear = { ...EMPTY_FILTER, year: 2020 };

    render(<FilterBar filter={filterWithYear} onChange={onChange} />);
    await user.selectOptions(screen.getByLabelText("年"), "");

    expect(onChange).toHaveBeenCalledWith({ ...filterWithYear, year: null });
  });
});
