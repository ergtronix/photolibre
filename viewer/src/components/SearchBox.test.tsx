import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SearchBox } from "./SearchBox";

describe("SearchBox", () => {
  it("calls onSearch with the trimmed query on submit", async () => {
    const user = userEvent.setup();
    const onSearch = vi.fn();

    render(<SearchBox onSearch={onSearch} onClear={vi.fn()} />);
    await user.type(screen.getByLabelText("検索"), "  夕日  ");
    await user.click(screen.getByRole("button", { name: "検索" }));

    expect(onSearch).toHaveBeenCalledWith("夕日");
  });

  it("calls onClear when submitted with an empty query", async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();

    render(<SearchBox onSearch={vi.fn()} onClear={onClear} />);
    await user.click(screen.getByRole("button", { name: "検索" }));

    expect(onClear).toHaveBeenCalled();
  });

  it("shows a clear button only when there is input, and clears it when clicked", async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();

    render(<SearchBox onSearch={vi.fn()} onClear={onClear} />);
    expect(screen.queryByRole("button", { name: "クリア" })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("検索"), "海");
    await user.click(screen.getByRole("button", { name: "クリア" }));

    expect(onClear).toHaveBeenCalled();
    expect(screen.getByLabelText("検索")).toHaveValue("");
  });
});
