import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Lightbox } from "./Lightbox";
import type { Photo } from "../lib/types";

const { getPhotoRotationMock, setPhotoRotationMock } = vi.hoisted(() => ({
  getPhotoRotationMock: vi.fn().mockResolvedValue(0),
  setPhotoRotationMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/api", () => ({
  readPhotoDataUrl: vi.fn().mockResolvedValue("data:image/jpeg;base64,AAAA"),
  getPhotoRotation: getPhotoRotationMock,
  setPhotoRotation: setPhotoRotationMock,
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
    albumNames: null,
    ...overrides,
  };
}

describe("Lightbox", () => {
  it("renders nothing when currentIndex is out of range", () => {
    const { container } = render(
      <Lightbox photos={[]} currentIndex={0} onClose={vi.fn()} onNavigate={vi.fn()} onRotated={vi.fn()} />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("shows the current photo's caption and loaded image", async () => {
    const photos = [makePhoto({ id: "1", filename: "sunset.jpg" })];

    render(<Lightbox photos={photos} currentIndex={0} onClose={vi.fn()} onNavigate={vi.fn()} onRotated={vi.fn()} />);

    expect(screen.getByText("sunset.jpg")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("img")).toBeInTheDocument());
  });

  it("calls onClose when the close button is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const photos = [makePhoto()];

    render(<Lightbox photos={photos} currentIndex={0} onClose={onClose} onNavigate={vi.fn()} onRotated={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "閉じる" }));

    expect(onClose).toHaveBeenCalled();
  });

  it("hides the prev button on the first photo and the next button on the last", () => {
    const photos = [makePhoto({ id: "1" }), makePhoto({ id: "2" })];

    render(<Lightbox photos={photos} currentIndex={0} onClose={vi.fn()} onNavigate={vi.fn()} onRotated={vi.fn()} />);

    expect(screen.queryByRole("button", { name: "前の写真" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "次の写真" })).toBeInTheDocument();
  });

  it("calls onNavigate with the next index when the next button is clicked", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    const photos = [makePhoto({ id: "1" }), makePhoto({ id: "2" })];

    render(<Lightbox photos={photos} currentIndex={0} onClose={vi.fn()} onNavigate={onNavigate} onRotated={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "次の写真" }));

    expect(onNavigate).toHaveBeenCalledWith(1);
  });

  it("closes on Escape key press", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const photos = [makePhoto()];

    render(<Lightbox photos={photos} currentIndex={0} onClose={onClose} onNavigate={vi.fn()} onRotated={vi.fn()} />);
    await user.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalled();
  });

  it("navigates to the next photo on ArrowRight key press", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    const photos = [makePhoto({ id: "1" }), makePhoto({ id: "2" })];

    render(<Lightbox photos={photos} currentIndex={0} onClose={vi.fn()} onNavigate={onNavigate} onRotated={vi.fn()} />);
    await user.keyboard("{ArrowRight}");

    expect(onNavigate).toHaveBeenCalledWith(1);
  });

  it("rotates clockwise from the currently stored rotation", async () => {
    const user = userEvent.setup();
    getPhotoRotationMock.mockResolvedValueOnce(90);
    const photos = [makePhoto({ id: "1" })];

    render(<Lightbox photos={photos} currentIndex={0} onClose={vi.fn()} onNavigate={vi.fn()} onRotated={vi.fn()} />);
    await waitFor(() => expect(getPhotoRotationMock).toHaveBeenCalledWith("1"));
    await user.click(screen.getByRole("button", { name: "時計回りに回転" }));

    await waitFor(() => expect(setPhotoRotationMock).toHaveBeenCalledWith("1", 180));
  });

  it("rotates counter-clockwise and wraps around at 0", async () => {
    const user = userEvent.setup();
    getPhotoRotationMock.mockResolvedValueOnce(0);
    const photos = [makePhoto({ id: "1" })];

    render(<Lightbox photos={photos} currentIndex={0} onClose={vi.fn()} onNavigate={vi.fn()} onRotated={vi.fn()} />);
    await waitFor(() => expect(getPhotoRotationMock).toHaveBeenCalledWith("1"));
    await user.click(screen.getByRole("button", { name: "反時計回りに回転" }));

    await waitFor(() => expect(setPhotoRotationMock).toHaveBeenCalledWith("1", 270));
  });

  it("notifies onRotated with the photo id after rotating so the grid can refresh its thumbnail", async () => {
    const user = userEvent.setup();
    getPhotoRotationMock.mockResolvedValueOnce(0);
    const onRotated = vi.fn();
    const photos = [makePhoto({ id: "1" })];

    render(<Lightbox photos={photos} currentIndex={0} onClose={vi.fn()} onNavigate={vi.fn()} onRotated={onRotated} />);
    await waitFor(() => expect(getPhotoRotationMock).toHaveBeenCalledWith("1"));
    await user.click(screen.getByRole("button", { name: "時計回りに回転" }));

    await waitFor(() => expect(onRotated).toHaveBeenCalledWith("1"));
  });

  it("zooms in when the zoom-in button is clicked", async () => {
    const user = userEvent.setup();
    const photos = [makePhoto({ id: "1" })];

    render(<Lightbox photos={photos} currentIndex={0} onClose={vi.fn()} onNavigate={vi.fn()} onRotated={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("img")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "拡大" }));

    expect(screen.getByRole("img")).toHaveStyle({ transform: "scale(1.25)" });
  });

  it("zooms out when the zoom-out button is clicked", async () => {
    const user = userEvent.setup();
    const photos = [makePhoto({ id: "1" })];

    render(<Lightbox photos={photos} currentIndex={0} onClose={vi.fn()} onNavigate={vi.fn()} onRotated={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("img")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "縮小" }));

    expect(screen.getByRole("img")).toHaveStyle({ transform: "scale(0.75)" });
  });

  it("zooms in on Ctrl+wheel scroll up but ignores plain wheel scroll", async () => {
    const photos = [makePhoto({ id: "1" })];

    render(<Lightbox photos={photos} currentIndex={0} onClose={vi.fn()} onNavigate={vi.fn()} onRotated={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("img")).toBeInTheDocument());

    const content = screen.getByRole("img").parentElement!;
    fireEvent.wheel(content, { deltaY: -100, ctrlKey: false });
    expect(screen.getByRole("img")).toHaveStyle({ transform: "scale(1)" });

    fireEvent.wheel(content, { deltaY: -100, ctrlKey: true });
    expect(screen.getByRole("img")).toHaveStyle({ transform: "scale(1.25)" });
  });

  it("resets zoom when navigating to a different photo", async () => {
    const user = userEvent.setup();
    const photos = [makePhoto({ id: "1" }), makePhoto({ id: "2" })];

    const { rerender } = render(
      <Lightbox photos={photos} currentIndex={0} onClose={vi.fn()} onNavigate={vi.fn()} onRotated={vi.fn()} />
    );
    await waitFor(() => expect(screen.getByRole("img")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "拡大" }));
    expect(screen.getByRole("img")).toHaveStyle({ transform: "scale(1.25)" });

    rerender(<Lightbox photos={photos} currentIndex={1} onClose={vi.fn()} onNavigate={vi.fn()} onRotated={vi.fn()} />);

    await waitFor(() => expect(screen.getByRole("img")).toHaveStyle({ transform: "scale(1)" }));
  });
});
