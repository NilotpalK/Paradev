import { db } from "@superset/db/client";
import { githubInstallations } from "@superset/db/schema";
import { asc, eq } from "drizzle-orm";

export function organizationInstallations(organizationId: string) {
	return db.query.githubInstallations.findMany({
		where: eq(githubInstallations.organizationId, organizationId),
		orderBy: [asc(githubInstallations.createdAt)],
	});
}
