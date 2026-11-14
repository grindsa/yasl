import { NextResponse } from "next/server";
import { getSessionGroup } from "./auth";

export type AuthedContext = {
  groupId: string;
  groupName: string;
};

/**
 * Re-checks the session inside a route handler and injects the group scope.
 */
export function withAuth(
  handler: (
    request: Request,
    ctx: AuthedContext,
    routeCtx?: { params: Promise<Record<string, string>> },
  ) => Promise<Response>,
): (
  request: Request,
  routeCtx?: { params: Promise<Record<string, string>> },
) => Promise<Response> {
  return async (request, routeCtx) => {
    const session = await getSessionGroup();
    if (!session) {
      return NextResponse.json(
        { error: "unauthorized", status: "anonymous" },
        { status: 401 },
      );
    }
    return handler(request, session, routeCtx);
  };
}
