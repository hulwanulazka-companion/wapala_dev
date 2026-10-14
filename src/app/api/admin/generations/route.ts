import { route, authenticated, jsonResponse } from "@/server/http/auth-handler";
import { readJson } from "@/server/http/body";
import {
  generationSchema,
  listGenerations,
  saveGeneration,
} from "@/server/domains/generations";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(request: Request) {
  return route(request, async () => {
    const { principal } = await authenticated(request, "generations:write");
    return jsonResponse({ generations: await listGenerations(principal) });
  });
}
export function POST(request: Request) {
  return route(request, async (ctx) => {
    const { principal } = await authenticated(request, "generations:write");
    return jsonResponse(
      await saveGeneration(
        principal,
        await readJson(request, generationSchema),
        ctx,
      ),
    );
  });
}
