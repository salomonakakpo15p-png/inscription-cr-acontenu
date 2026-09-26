import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => undefined } as TrpcContext["res"],
  };
}

describe("participants", () => {
  it("rejects incomplete public registration details", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    await expect(caller.participants.create({ lastName: "A", firstName: "", country: "" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects photo data that is not an approved image format", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    await expect(caller.participants.create({ lastName: "Adjovi", firstName: "Grace", country: "Bénin", photoData: "data:text/plain;base64,ZmFrZQ==" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("protects the participant list behind authentication", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    await expect(caller.participants.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
