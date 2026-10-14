import { z } from "zod";
import { route, authenticated, jsonResponse } from "@/server/http/auth-handler";
import { readJson } from "@/server/http/body";
import { updateAdmin, resetAdminPassword } from "@/server/auth/users";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export function PATCH(request: Request, context: Context) {
  return route(request, async (ctx) => {
    const { principal } = await authenticated(request, "users:write");
    const input = await readJson(
      request,
      z
        .object({
          name: z.string().max(100).optional(),
          role: z
            .enum(["SUPER_USER", "POH", "MULTIMEDIA", "INVENTARIS", "ANGGOTA"])
            .optional(),
          active: z.boolean().optional(),
          memberId: z.uuid().nullable().optional(),
          archived: z.boolean().optional(),
          unlock: z.boolean().optional(),
        })
        .strict(),
    );
    return jsonResponse(
      await updateAdmin(principal, (await context.params).id, input, ctx),
    );
  });
}
export function POST(request: Request, context: Context) {
  return route(request, async (ctx) => {
    const { principal } = await authenticated(request, "users:write");
    await readJson(
      request,
      z.object({ action: z.literal("reset-password") }).strict(),
    );
    return jsonResponse(
      await resetAdminPassword(principal, (await context.params).id, ctx),
    );
  });
}
