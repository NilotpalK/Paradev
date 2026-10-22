import { Octokit } from "@octokit/core";
import { githubUserTokenFor } from "../../../lib/github-user";
import { installationOctokit } from "../../../lib/sandbox/clone-token";
import { userError } from "../../../trpc";
import { findInstalledRepository } from "./find-installed-repository";

export const GITHUB_NOT_CONNECTED_MESSAGE =
	"Connect GitHub in Settings to act on pull requests as yourself";

/**
 * GitHub as the person asking: their own connection when they have one, the
 * organization's App installation otherwise. Reads may take either; a write
 * must be theirs, or GitHub would record it under the App's name.
 */
export async function viewerOctokit(args: {
	userId: string;
	organizationId: string;
	repoFullName: string;
}): Promise<{ octokit: Octokit; actsAsViewer: boolean }> {
	const token = await githubUserTokenFor(args.userId);
	if (token)
		return { octokit: new Octokit({ auth: token }), actsAsViewer: true };
	const { installation } = await findInstalledRepository(
		args.organizationId,
		args.repoFullName,
	);
	return {
		octokit: await installationOctokit(installation.installationId),
		actsAsViewer: false,
	};
}

export async function viewerOnlyOctokit(userId: string): Promise<Octokit> {
	const token = await githubUserTokenFor(userId);
	if (!token) {
		throw userError({
			code: "PRECONDITION_FAILED",
			message: GITHUB_NOT_CONNECTED_MESSAGE,
			i18nKey: "serverError.githubUser.notConnected",
		});
	}
	return new Octokit({ auth: token });
}
