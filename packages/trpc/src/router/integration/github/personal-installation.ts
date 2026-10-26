import { App } from "@octokit/app";
import { db } from "@superset/db/client";
import {
	githubInstallations,
	githubRepositories,
	githubUserConnections,
} from "@superset/db/schema";
import { and, eq, notInArray, or } from "drizzle-orm";
import { z } from "zod";
import { env } from "../../../env";
import { installationOctokit } from "../../../lib/sandbox/clone-token";
import { open, seal } from "../../../lib/secret-box";
import { organizationSyncsNow } from "../../../lib/sync-policy/syncPolicy";

const INSTALL_STATE_AAD = "github-app-install";
const INSTALL_STATE_TTL_MS = 10 * 60_000;

const installStateSchema = z.object({
	organizationId: z.string().uuid(),
	userId: z.string().uuid(),
	expiresAt: z.number(),
});

export function githubAppInstallUrl(args: {
	organizationId: string;
	userId: string;
}): string | null {
	if (!env.GH_APP_SLUG) return null;
	try {
		const state = seal(
			JSON.stringify({
				organizationId: args.organizationId,
				userId: args.userId,
				expiresAt: Date.now() + INSTALL_STATE_TTL_MS,
			}),
			INSTALL_STATE_AAD,
		);
		const url = new URL(
			`https://github.com/apps/${env.GH_APP_SLUG}/installations/new`,
		);
		url.searchParams.set("state", state);
		return url.toString();
	} catch {
		return null;
	}
}

export function readGithubAppInstallState(
	state: string,
): { organizationId: string; userId: string } | null {
	try {
		const parsed = installStateSchema.parse(
			JSON.parse(open(state, INSTALL_STATE_AAD)),
		);
		if (parsed.expiresAt < Date.now()) return null;
		return {
			organizationId: parsed.organizationId,
			userId: parsed.userId,
		};
	} catch {
		return null;
	}
}

function githubAppClient(): App | null {
	if (!env.GH_APP_ID || !env.GH_APP_PRIVATE_KEY) return null;
	return new App({
		appId: env.GH_APP_ID,
		privateKey: env.GH_APP_PRIVATE_KEY,
	});
}

export async function syncInstallationRepositories(args: {
	installationDbId: string;
	githubInstallationId: string;
	organizationId: string;
}): Promise<number> {
	const octokit = await installationOctokit(args.githubInstallationId);
	const repos: Array<{
		id: number | bigint;
		name: string;
		full_name: string;
		default_branch?: string;
		private: boolean;
		owner: { login: string };
	}> = [];
	const perPage = 100;
	for (let page = 1; page <= 20; page++) {
		const { data } = await octokit.request("GET /installation/repositories", {
			per_page: perPage,
			page,
		});
		repos.push(...data.repositories);
		if (data.repositories.length < perPage) break;
	}

	const seenRepoIds: string[] = [];
	for (const repo of repos) {
		const repoId = String(repo.id);
		seenRepoIds.push(repoId);
		await db
			.insert(githubRepositories)
			.values({
				installationId: args.installationDbId,
				organizationId: args.organizationId,
				repoId,
				owner: repo.owner.login,
				name: repo.name,
				fullName: repo.full_name,
				defaultBranch: repo.default_branch ?? "main",
				isPrivate: repo.private,
			})
			.onConflictDoUpdate({
				target: [githubRepositories.repoId],
				set: {
					installationId: args.installationDbId,
					organizationId: args.organizationId,
					owner: repo.owner.login,
					name: repo.name,
					fullName: repo.full_name,
					defaultBranch: repo.default_branch ?? "main",
					isPrivate: repo.private,
					updatedAt: new Date(),
				},
			});
	}

	if (seenRepoIds.length > 0) {
		await db
			.delete(githubRepositories)
			.where(
				and(
					eq(githubRepositories.installationId, args.installationDbId),
					notInArray(githubRepositories.repoId, seenRepoIds),
				),
			);
	} else {
		await db
			.delete(githubRepositories)
			.where(eq(githubRepositories.installationId, args.installationDbId));
	}

	await db
		.update(githubInstallations)
		.set({ lastSyncedAt: new Date() })
		.where(eq(githubInstallations.id, args.installationDbId));

	return repos.length;
}

async function liftBotSuspensionIfNeeded(
	app: App,
	installation: {
		id: string;
		installationId: string;
		suspended: boolean;
	},
): Promise<boolean> {
	const installationId = Number(installation.installationId);
	const { data: remote } = await app.octokit.request(
		"GET /app/installations/{installation_id}",
		{ installation_id: installationId },
	);
	if (!remote.suspended_at) {
		if (installation.suspended) {
			await db
				.update(githubInstallations)
				.set({ suspended: false, suspendedAt: null })
				.where(eq(githubInstallations.id, installation.id));
			return true;
		}
		return false;
	}
	if (remote.suspended_by?.type !== "Bot") return false;
	await app.octokit.request(
		"DELETE /app/installations/{installation_id}/suspended",
		{ installation_id: installationId },
	);
	await db
		.update(githubInstallations)
		.set({ suspended: false, suspendedAt: null })
		.where(eq(githubInstallations.id, installation.id));
	return true;
}

/**
 * Ensures a user's personal ("User") GitHub App installation is linked,
 * unsuspended when their active organization syncs, and has its repositories
 * populated in `github_repositories`.
 */
export async function syncPersonalGithubInstallation(args: {
	organizationId: string;
	userId: string;
	force?: boolean;
}) {
	let existing = await db.query.githubInstallations.findFirst({
		where: and(
			eq(githubInstallations.connectedByUserId, args.userId),
			eq(githubInstallations.accountType, "User"),
		),
	});

	const app = githubAppClient();
	let newlyDiscovered = false;

	if (!existing && app) {
		const connection = await db.query.githubUserConnections.findFirst({
			where: eq(githubUserConnections.userId, args.userId),
			columns: { login: true },
		});
		if (connection?.login) {
			const remote = await app.octokit
				.request("GET /users/{username}/installation", {
					username: connection.login,
				})
				.then((res) => res.data)
				.catch(() => null);
			if (remote) {
				const account = remote.account;
				const accountLogin =
					account && "login" in account ? account.login : connection.login;
				const [conflict] = await db
					.select()
					.from(githubInstallations)
					.where(eq(githubInstallations.installationId, String(remote.id)))
					.limit(1);
				if (!conflict) {
					const [inserted] = await db
						.insert(githubInstallations)
						.values({
							organizationId: args.organizationId,
							connectedByUserId: args.userId,
							installationId: String(remote.id),
							accountLogin,
							accountType: "User",
							permissions: remote.permissions as Record<string, string>,
							suspended: Boolean(remote.suspended_at),
							suspendedAt: remote.suspended_at
								? new Date(remote.suspended_at)
								: null,
						})
						.onConflictDoNothing()
						.returning();
					if (inserted) {
						existing = inserted;
						newlyDiscovered = true;
					}
				} else if (conflict.connectedByUserId === args.userId) {
					existing = conflict;
				}
			}
		}
	}

	if (!existing) return null;

	const activeOrgSyncs = await organizationSyncsNow(args.organizationId);
	let targetOrganizationId = existing.organizationId;
	let rehomed = false;

	if (
		activeOrgSyncs &&
		existing.organizationId !== args.organizationId &&
		!(await organizationSyncsNow(existing.organizationId))
	) {
		targetOrganizationId = args.organizationId;
		rehomed = true;
		await db
			.update(githubInstallations)
			.set({ organizationId: targetOrganizationId })
			.where(eq(githubInstallations.id, existing.id));
		await db
			.update(githubRepositories)
			.set({ organizationId: targetOrganizationId })
			.where(eq(githubRepositories.installationId, existing.id));
	}

	let unsuspended = false;
	if (app && activeOrgSyncs && (existing.suspended || args.force)) {
		unsuspended = await liftBotSuspensionIfNeeded(app, existing).catch(
			() => false,
		);
	}

	const needsSync =
		activeOrgSyncs &&
		Boolean(app) &&
		(args.force ||
			newlyDiscovered ||
			rehomed ||
			unsuspended ||
			existing.lastSyncedAt === null);

	if (needsSync) {
		await syncInstallationRepositories({
			installationDbId: existing.id,
			githubInstallationId: existing.installationId,
			organizationId: targetOrganizationId,
		});
	}

	return existing;
}

/**
 * Installations whose repositories should be visible to `userId` in
 * `organizationId`: the organization's own installation(s), plus the caller's
 * personal ("User") installation. Another member's personal installation is
 * excluded so private personal repositories stay private to their owner.
 */
export async function visibleGithubInstallations(args: {
	organizationId: string;
	userId?: string;
}) {
	const rows = await db.query.githubInstallations.findMany({
		where: args.userId
			? or(
					eq(githubInstallations.organizationId, args.organizationId),
					and(
						eq(githubInstallations.accountType, "User"),
						eq(githubInstallations.connectedByUserId, args.userId),
					),
				)
			: eq(githubInstallations.organizationId, args.organizationId),
	});

	if (!args.userId) {
		const orgRows = rows.filter((row) => row.accountType === "Organization");
		return orgRows.length > 0 ? orgRows : rows.slice(0, 1);
	}

	return rows.filter(
		(row) =>
			(row.organizationId === args.organizationId &&
				row.accountType !== "User") ||
			(row.accountType === "User" && row.connectedByUserId === args.userId),
	);
}

/**
 * The primary installation for an organization (preferring an "Organization"
 * installation over a personal "User" installation), plus the caller's own
 * personal installation when present.
 */
export async function findOrganizationInstallations(args: {
	organizationId: string;
	userId: string;
}) {
	const rows = await visibleGithubInstallations(args);
	const organizationInstallation =
		rows.find(
			(row) =>
				row.organizationId === args.organizationId &&
				row.accountType !== "User",
		) ?? null;
	const personalInstallation =
		rows.find(
			(row) =>
				row.accountType === "User" && row.connectedByUserId === args.userId,
		) ?? null;
	const primary = organizationInstallation ?? personalInstallation;
	return { primary, organizationInstallation, personalInstallation };
}

export function isRepositoryVisibleToUser(args: {
	repository: { organizationId: string };
	installation: { accountType: string; connectedByUserId: string };
	organizationId: string;
	userId?: string;
}): boolean {
	if (args.installation.accountType !== "User") {
		return args.repository.organizationId === args.organizationId;
	}
	if (args.userId) {
		return args.installation.connectedByUserId === args.userId;
	}
	return args.repository.organizationId === args.organizationId;
}
