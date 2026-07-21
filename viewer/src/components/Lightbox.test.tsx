import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Lightbox } from "./Lightbox";
import type { Photo } from "../lib/types";

vi.mock("../lib/api", () => ({
  readPhotoDataUrl: vi.fn().mockResolvedValue("data:image/jpeg;base64,AAAA"),
}));

function makePhoto(overrides: Partial<Photo> = {}): Photo {
  return {
    id: "1",
    filename: "a.jpg",
    filepath: "photos/2020/01/a.jpg",
    mediaType: "photo",
    dateTaken: null,
    dateAdded: null,
    latitude: null,
    longitude: null,
    favorite: false,
    hidden: false,
    title: null,
    description: null,
    width: null,
    height: null,
    source: "source_a",
    ...overrides,
  };
}

describe("Lightbox", () => {
  it("renders nothing when currentIndex is out of range", () => {
    const { container } = render(
      <Lightbox photos={[]} currentIndex={0} onClose={vi.fn()} onNavigate={vi.fn()} />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("shows the current photo's caption and loaded image", async () => {
    const photos = [makePhoto({ id: "1", filename: "sunset.jpg" })];

    render(<Lightbox photos={photos} currentIndex={0} onClose={vi.fn()} onNavigate={vi.fn()} />);

    expect(screen.getByText("sunset.jpg")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("img")).toBeInTheDocument());
  });

  it("calls onClose when the close button is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const photos = [makePhoto()];

    render(<Lightbox photos={photos} currentIndex={0} onClose={onClose} onNavigate={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "閉じる" }));

    expect(onClose).toHaveBeenCalled();
  });

  it("hides the prev button on the first photo and the next button on the last", () => {
    const photos = [makePhoto({ id: "1" }), makePhoto({ id: "2" })];

    render(<Lightbox photos={photos} currentIndex={0} onClose={vi.fn()} onNavigate={vi.fn()} />);

    expect(screen.queryByRole("button", { name: "前の写真" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "次の写真" })).toBeInTheDocument();
  });

  it("calls onNavigate with the next index when the next button is clicked", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    const photos = [makePhoto({ id: "1" }), makePhoto({ id: "2" })];

    render(<Lightbox photos={photos} currentIndex={0} onClose={vi.fn()} onNavigate={onNavigate} />);
    await user.click(screen.getByRole("button", { name: "次の写真" }));

    expect(onNavigate).toHaveBeenCalledWith(1);
  });

  it("closes on Escape key press", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const photos = [makePhoto()];

    render(<Lightbox photos={photos} currentIndex={0} onClose={onClose} onNavigate={vi.fn()} />);
    await user.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalled();
  });

  it("navigates to the next photo on ArrowRight key press", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    const photos = [makePhoto({ id: "1" }), makePhoto({ id: "2" })];

    render(<Lightbox photos={photos} currentIndex={0} onClose={vi.fn()} onNavigate={onNavigate} />);
    await user.keyboard("{ArrowRight}");

    expect(onNavigate).toHaveBeenCalledWith(1);
  });
});
