import { db } from "@superset/db/client";
import { githubRepositories } from "@superset/db/schema";
import { and, inArray, sql } from "drizzle-orm";
import { userError } from "../../../trpc";
import { organizationInstallations } from "./installations";

export async function findInstalledRepository(
	organizationId: string,
	repoFullName: string,
) {
	const installations = await organizationInstallations(organizationId);
	if (installations.length === 0)
		throw userError({
			code: "PRECONDITION_FAILED",
			message: "GitHub installation not found",
			i18nKey: "serverError.integration.githubInstallationNotFound",
		});
	const repo = await db.query.githubRepositories.findFirst({
		where: and(
			inArray(
				githubRepositories.installationId,
				installations.map((installation) => installation.id),
			),
			sql`lower(${githubRepositories.fullName}) = ${repoFullName.toLowerCase()}`,
		),
		columns: { id: true, fullName: true, installationId: true },
	});
	const installation = installations.find(
		(candidate) => candidate.id === repo?.installationId,
	);
	if (!repo || !installation)
		throw userError({
			code: "NOT_FOUND",
			message: `${repoFullName} is not a repository the GitHub App is installed on`,
			i18nKey: "serverError.integration.repositoryNotInstalled",
			params: { repoFullName },
		});
	return { installation, repo };
}
