import { describe, expect, test } from "bun:test";
import {
	isRepositoryVisibleToUser,
	readGithubAppInstallState,
} from "./personal-installation";

const ORG_A = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";
const USER_ALICE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_BOB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("isRepositoryVisibleToUser", () => {
	test("allows an organization installation repository in its own organization", () => {
		expect(
			isRepositoryVisibleToUser({
				repository: { organizationId: ORG_A },
				installation: {
					accountType: "Organization",
					connectedByUserId: USER_ALICE,
				},
				organizationId: ORG_A,
				userId: USER_BOB,
			}),
		).toBe(true);
	});

	test("refuses an organization installation repository from another organization", () => {
		expect(
			isRepositoryVisibleToUser({
				repository: { organizationId: ORG_A },
				installation: {
					accountType: "Organization",
					connectedByUserId: USER_ALICE,
				},
				organizationId: ORG_B,
				userId: USER_ALICE,
			}),
		).toBe(false);
	});

	test("allows a personal User installation repository to its owner in any organization", () => {
		expect(
			isRepositoryVisibleToUser({
				repository: { organizationId: ORG_A },
				installation: {
					accountType: "User",
					connectedByUserId: USER_ALICE,
				},
				organizationId: ORG_B,
				userId: USER_ALICE,
			}),
		).toBe(true);
	});

	test("hides a personal User installation repository from other members of the organization", () => {
		expect(
			isRepositoryVisibleToUser({
				repository: { organizationId: ORG_A },
				installation: {
					accountType: "User",
					connectedByUserId: USER_ALICE,
				},
				organizationId: ORG_A,
				userId: USER_BOB,
			}),
		).toBe(false);
	});
});

describe("readGithubAppInstallState", () => {
	test("returns null for an invalid state string", () => {
		expect(readGithubAppInstallState("invalid-state")).toBeNull();
	});
});
