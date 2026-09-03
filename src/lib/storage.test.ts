import { beforeEach, describe, expect, it, vi } from "vitest";

const storageMock = vi.hoisted(() => ({
  upload: vi.fn(),
  getPublicUrl: vi.fn(),
}));
const telemetryMock = vi.hoisted(() => ({ logGameEvent: vi.fn() }));

vi.mock("./supabase", () => ({
  isSupabaseConfigured: true,
  getSupabase: () => ({
    storage: {
      from: () => storageMock,
    },
  }),
}));
vi.mock("../party/telemetry", () => telemetryMock);

import { uploadDrawing } from "./storage";

describe("uploadDrawing", () => {
  beforeEach(() => {
    storageMock.upload.mockReset();
    storageMock.getPublicUrl.mockReset();
    telemetryMock.logGameEvent.mockReset();
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
    expect(telemetryMock.logGameEvent).toHaveBeenCalledWith("UPLOAD_COMPLETE", {
      path,
      attempt: 1,
    });
  });

  it("repete uma vez e registra sucesso depois de oscilação da rede", async () => {
    const path = "1234/match-1/chain-1/step-2.webp";
    const blob = new Blob(["desenho"], { type: "image/webp" });
    storageMock.upload
      .mockResolvedValueOnce({ error: new Error("5G caiu") })
      .mockResolvedValueOnce({ error: null });

    await expect(uploadDrawing(path, blob)).resolves.toBe(path);
    expect(storageMock.upload).toHaveBeenCalledTimes(2);
    expect(telemetryMock.logGameEvent).toHaveBeenCalledWith("UPLOAD_STARTED", {
      path,
      attempt: 2,
    });
    expect(telemetryMock.logGameEvent).toHaveBeenCalledWith("UPLOAD_COMPLETE", {
      path,
      attempt: 2,
    });
  });

  it("abandona só a imagem após duas falhas e registra o motivo", async () => {
    const path = "1234/match-1/chain-1/step-2.webp";
    storageMock.upload.mockResolvedValue({ error: new Error("offline") });

    await expect(uploadDrawing(path, new Blob(["desenho"]))).resolves.toBeNull();
    expect(storageMock.upload).toHaveBeenCalledTimes(2);
    expect(telemetryMock.logGameEvent).toHaveBeenCalledWith("UPLOAD_FAILED", {
      path,
      attempts: 2,
    });
  });
});
