import { prisma } from "./prisma";
import type { SessionUser } from "./session";

export async function audit(
  user: SessionUser,
  action: "CREATE" | "UPDATE" | "DELETE" | "UPLOAD" | "STAGE",
  entity: string,
  entityId: string,
  summary: string
) {
  await prisma.auditLog.create({
    data: { userId: user.id, userName: user.name, action, entity, entityId, summary },
  });
}
