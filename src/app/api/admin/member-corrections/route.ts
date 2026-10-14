import { route, authenticated, jsonResponse } from "@/server/http/auth-handler";
import { readJson } from "@/server/http/body";
import {
  listCorrections,
  reviewCorrection,
  reviewSchema,
} from "@/server/domains/member-portal";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(request: Request) {
  return route(request, async () => {
    const { principal } = await authenticated(request, "corrections:review");
    return jsonResponse({
      requests: await listCorrections(
        principal,
        new URL(request.url).searchParams.get("cursor") || undefined,
      ),
    });
  });
}
export function POST(request: Request) {
  return route(request, async (ctx) => {
    const { principal } = await authenticated(request, "corrections:review");
    return jsonResponse(
      await reviewCorrection(
        principal,
        await readJson(request, reviewSchema),
        ctx,
      ),
    );
  });
}
