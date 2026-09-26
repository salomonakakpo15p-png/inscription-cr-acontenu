import { z } from "zod";
import { timingSafeEqual } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { ENV } from "./_core/env";
import { getSessionCookieOptions } from "./_core/cookies";
import { sdk } from "./_core/sdk";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { createParticipant, deleteParticipant, listParticipants, upsertUser } from "./db";
import { storagePut } from "./storage";

/** Account used by the password sign-in when no OAuth portal is configured. */
const LOCAL_ADMIN_OPEN_ID = "local-admin";

const participantInput = z.object({
  lastName: z.string().trim().min(2, "Le nom doit contenir au moins 2 caractères").max(80),
  firstName: z.string().trim().min(2, "Le prénom doit contenir au moins 2 caractères").max(80),
  country: z.string().trim().min(2, "Le pays est requis").max(80),
  photoData: z.string().regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/, "Photo invalide").optional(),
});

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
    // Password sign-in for machines where the Manus OAuth portal is not
    // configured (local development). Issues the same session cookie as the
    // OAuth callback, so every protected procedure behaves identically.
    loginLocal: publicProcedure
      .input(z.object({ password: z.string().min(1, "Mot de passe requis").max(200) }))
      .mutation(async ({ ctx, input }) => {
        if (ENV.oAuthServerUrl) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Connexion Manus requise." });
        }
        if (!ENV.adminPassword) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "ADMIN_PASSWORD manquant : ajoutez-le au fichier .env.",
          });
        }
        const provided = Buffer.from(input.password, "utf8");
        const expected = Buffer.from(ENV.adminPassword, "utf8");
        if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Mot de passe incorrect." });
        }

        await upsertUser({
          openId: LOCAL_ADMIN_OPEN_ID,
          name: "Organisateur",
          loginMethod: "local",
          role: "admin",
          lastSignedIn: new Date(),
        });

        const sessionToken = await sdk.createSessionToken(LOCAL_ADMIN_OPEN_ID, {
          name: "Organisateur",
          expiresInMs: ONE_YEAR_MS,
        });
        ctx.res.cookie(COOKIE_NAME, sessionToken, {
          ...getSessionCookieOptions(ctx.req),
          maxAge: ONE_YEAR_MS,
        });
        return { success: true } as const;
      }),
  }),
  participants: router({
    create: publicProcedure.input(participantInput).mutation(async ({ input }) => {
      let photoUrl: string | undefined;
      if (input.photoData) {
        const match = input.photoData.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
        if (!match) throw new Error("Photo invalide");
        const [, contentType, encoded] = match;
        const bytes = Buffer.from(encoded, "base64");
        if (bytes.length > 5 * 1024 * 1024) throw new Error("La photo ne doit pas dépasser 5 Mo");
        const extension = contentType.split("/")[1] === "jpeg" ? "jpg" : contentType.split("/")[1];
        const uploaded = await storagePut(`participants/${Date.now()}-${input.firstName}.${extension}`, bytes, contentType);
        photoUrl = uploaded.url;
      }
      return createParticipant({ lastName: input.lastName, firstName: input.firstName, country: input.country, photoUrl });
    }),
    list: protectedProcedure.query(() => listParticipants()),
    remove: adminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(({ input }) => deleteParticipant(input.id)),
  }),
});

export type AppRouter = typeof appRouter;
