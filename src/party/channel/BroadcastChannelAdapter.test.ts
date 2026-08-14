import { afterEach, describe, expect, it } from "vitest";
import { createBroadcastChannelAdapter } from "./BroadcastChannelAdapter";
import { createPartyState, partyReducer } from "../partyReducer";
import type { PartyChannel, PartyEvent } from "./PartyChannel";
import type { Player } from "../types";

const open: PartyChannel[] = [];

function makeChannel(pin: string): PartyChannel {
  const channel = createBroadcastChannelAdapter(pin);
  open.push(channel);
  return channel;
}

/** BroadcastChannel entrega de forma assíncrona; espera um tick de macrotask. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

const PLAYER: Player = {
  id: "player-1",
  nickname: "Ana",
  color: "#ff5c8a",
  avatarSeed: "seed-ana",
  score: 0,
  joinedAt: 1000,
};

afterEach(() => {
  open.splice(0).forEach((channel) => channel.close());
});

describe("BroadcastChannelAdapter", () => {
  it("entrega o evento para a outra ponta", async () => {
    const host = makeChannel("1234");
    const player = makeChannel("1234");
    const received: PartyEvent[] = [];
    host.subscribe((event) => received.push(event));

    player.broadcast({ type: "PLAYER_JOIN", player: PLAYER });
    await flush();

    expect(received).toEqual([{ type: "PLAYER_JOIN", player: PLAYER }]);
  });

  it("não ecoa de volta para quem enviou", async () => {
    const player = makeChannel("1234");
    const received: PartyEvent[] = [];
    player.subscribe((event) => received.push(event));

    player.broadcast({ type: "REQUEST_STATE" });
    await flush();

    expect(received).toEqual([]);
  });

  it("isola salas com PINs diferentes", async () => {
    const sala1234 = makeChannel("1234");
    const sala9999 = makeChannel("9999");
    const received: PartyEvent[] = [];
    sala1234.subscribe((event) => received.push(event));

    sala9999.broadcast({ type: "REQUEST_STATE" });
    await flush();

    expect(received).toEqual([]);
  });

  it("um handler que estoura não derruba os outros", async () => {
    const host = makeChannel("1234");
    const player = makeChannel("1234");
    const received: PartyEvent[] = [];
    host.subscribe(() => {
      throw new Error("handler quebrado");
    });
    host.subscribe((event) => received.push(event));

    player.broadcast({ type: "REQUEST_STATE" });
    await flush();

    expect(received).toHaveLength(1);
  });

  it("para de entregar depois do unsubscribe", async () => {
    const host = makeChannel("1234");
    const player = makeChannel("1234");
    const received: PartyEvent[] = [];
    const unsubscribe = host.subscribe((event) => received.push(event));

    unsubscribe();
    player.broadcast({ type: "REQUEST_STATE" });
    await flush();

    expect(received).toEqual([]);
  });

  it("broadcast depois de close não lança", () => {
    const channel = makeChannel("1234");
    channel.close();
    expect(() => channel.broadcast({ type: "REQUEST_STATE" })).not.toThrow();
  });

  it("protocolo completo: player pede estado, host responde, player entra", async () => {
    const host = makeChannel("4321");
    const player = makeChannel("4321");

    // Host: autoridade do estado.
    let hostState = createPartyState("4321", 0);
    host.subscribe((event) => {
      if (event.type === "REQUEST_STATE") {
        host.broadcast({ type: "STATE", state: hostState });
      }
      if (event.type === "PLAYER_JOIN") {
        hostState = partyReducer(hostState, { type: "PLAYER_JOIN", player: event.player });
        host.broadcast({ type: "STATE", state: hostState });
      }
    });

    // Player: só renderiza o que o host mandar.
    let playerView = createPartyState("4321", 0);
    player.subscribe((event) => {
      if (event.type === "STATE") playerView = event.state;
    });

    player.broadcast({ type: "REQUEST_STATE" });
    await flush();
    expect(playerView.players).toHaveLength(0);

    player.broadcast({ type: "PLAYER_JOIN", player: PLAYER });
    await flush();

    expect(hostState.players).toHaveLength(1);
    expect(playerView.players).toEqual(hostState.players);
    expect(playerView.players[0].nickname).toBe("Ana");
  });
});
