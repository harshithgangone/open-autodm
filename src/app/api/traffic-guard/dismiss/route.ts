import { z } from 'zod';
import { getAuthenticatedUser, unauthorized } from '@/lib/auth';
import { markNotificationRead } from '@/lib/trafficGuard/tracker';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DismissSchema = z.object({
  notificationId: z.string().uuid(),
});

export async function POST(request: Request): Promise<Response> {
  const user = await getAuthenticatedUser(request);
  if (!user) return unauthorized();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = DismissSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
  }

  const { notificationId } = parsed.data;

  try {
    await markNotificationRead(notificationId, user.id);
    return Response.json({ success: true });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Failed to dismiss notification' },
      { status: 500 }
    );
  }
}
