/**
 * POST /api/recommendation
 *
 * Thin HTTP adapter over `recommendation-service`. All business logic lives in
 * lib/; this file only deals with parsing, status codes and CORS.
 *
 * The Shopify storefront calls this cross-origin, so we answer preflight and
 * echo an allow-listed origin. If you front this with a Shopify App Proxy
 * instead, the request becomes same-origin and the CORS headers are simply
 * unused — both paths work.
 */

import { NextResponse, type NextRequest } from "next/server";
import { buildRecommendation } from "@/lib/recommendation-service";

/** Always run per-request; a recommendation depends entirely on the body. */
export const dynamic = "force-dynamic";

/**
 * Comma-separated allowlist, e.g.
 * ALLOWED_ORIGINS="https://kerala-ayurveda-demo.myshopify.com,https://keralaayurveda.com"
 * Unset means "reflect any origin", which is fine for local dev and the public
 * demo but should be set to the real storefront in production.
 */
function allowedOrigin(request: NextRequest): string {
  const configured = (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const origin = request.headers.get("origin");
  if (configured.length === 0) return origin ?? "*";
  return origin && configured.includes(origin) ? origin : configured[0];
}

function corsHeaders(request: NextRequest): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": allowedOrigin(request),
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export async function OPTIONS(request: NextRequest) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export async function POST(request: NextRequest) {
  const headers = corsHeaders(request);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { message: "Request body must be valid JSON." } },
      { status: 400, headers },
    );
  }

  try {
    const result = await buildRecommendation(body);

    if (!result.ok) {
      return NextResponse.json(
        {
          error: {
            message: "We couldn't read those answers. Please check the highlighted fields.",
            fields: result.errors,
          },
        },
        { status: 422, headers },
      );
    }

    return NextResponse.json(result.data, { status: 200, headers });
  } catch (error) {
    // The engine is pure and the Claude layer swallows its own failures, so
    // reaching here means something genuinely unexpected broke.
    console.error("[api/recommendation] unhandled failure:", error);
    return NextResponse.json(
      { error: { message: "We couldn't build a recommendation just now. Please try again." } },
      { status: 500, headers },
    );
  }
}
