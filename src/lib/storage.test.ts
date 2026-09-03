import { beforeEach, describe, expect, it, vi } from "vitest";

const storageMock = vi.hoisted(() => ({
  upload: vi.fn(),
  getPublicUrl: vi.fn(),
}));

vi.mock("./supabase", () => ({
  isSupabaseConfigured: true,
  getSupabase: () => ({
    storage: {
      from: () => storageMock,
    },
  }),
}));

import { uploadDrawing } from "./storage";

describe("uploadDrawing", () => {
  beforeEach(() => {
    storageMock.upload.mockReset();
    storageMock.getPublicUrl.mockReset();
    storageMock.upload.mockResolvedValue({ error: null });
  });

  it("devolve o caminho relativo que o banco e a projeção esperam", async () => {
    const path = "1234/match-1/chain-1/step-2.webp";
    const blob = new Blob(["desenho"], { type: "image/webp" });

    await expect(uploadDrawing(path, blob)).resolves.toBe(path);

    expect(storageMock.upload).toHaveBeenCalledWith(path, blob, {
      contentType: "image/webp",
      upsert: true,
      cacheControl: "3600",
    });
    expect(storageMock.getPublicUrl).not.toHaveBeenCalled();
  });
});
