import { z } from "zod";
import { route, authenticated, jsonResponse } from "@/server/http/auth-handler";
import { readJson } from "@/server/http/body";
import { listUsers, createAdmin } from "@/server/auth/users";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(request: Request) {
  return route(request, async () => {
    const { principal } = await authenticated(request, "users:read");
    return jsonResponse({ users: await listUsers(principal) });
  });
}
export function POST(request: Request) {
  return route(request, async (ctx) => {
    const { principal } = await authenticated(request, "users:write");
    const input = await readJson(
      request,
      z
        .object({
          email: z.email().max(254),
          name: z.string().trim().min(1).max(100),
          role: z.enum([
            "SUPER_USER",
            "POH",
            "MULTIMEDIA",
            "INVENTARIS",
            "ANGGOTA",
          ]),
          memberId: z.uuid().optional(),
        })
        .strict(),
    );
    return jsonResponse(await createAdmin(principal, input, ctx), 201);
  });
}
