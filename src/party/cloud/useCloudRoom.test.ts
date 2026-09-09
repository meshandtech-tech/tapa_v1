import { describe, expect, it } from "vitest";
import { classifyRoomError } from "./useCloudRoom";

describe("classificação de erro de sala", () => {
  it.each([
    ["room_not_found", "not_found"],
    ["room_closed", "closed"],
    ["room_expired", "expired"],
    ["invalid_pin", "invalid_pin"],
    ["sem_sessao", "auth"],
    ["auth_error", "auth"],
    ["room_forbidden", "stale_session"],
    ["qualquer_erro_novo", "server"],
  ] as const)("%s vira %s", (error, issue) => {
    expect(classifyRoomError(error)).toBe(issue);
  });
});
