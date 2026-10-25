import { describe, expect, test } from "bun:test";
import type { AutumnCatalogPlan } from "@superset/shared/billing";
import { currentPlanIdForLegacy, heldPlanIdForLegacy } from "./plan-ids";

function seatLicense(
	id: string,
	amount: number,
	interval: "month" | "year",
): AutumnCatalogPlan {
	return { id, name: id, price: { amount, interval }, items: [] };
}

function plan(
	id: string,
	metadata: Record<string, unknown>,
	licensePlanId?: string,
): AutumnCatalogPlan {
	return {
		id,
		name: id,
		metadata,
		licenses: licensePlanId ? [{ licensePlanId }] : null,
		items: [],
	};
}

const catalog = [
	seatLicense("pro_seat", 20, "month"),
	seatLicense("pro_seat_annual", 192, "year"),
	plan("pro_v2", { self_serve: true, family: "pro" }, "pro_seat"),
	plan("pro_v2_annual", { self_serve: true, family: "pro" }, "pro_seat_annual"),
	plan("team", { self_serve: true, family: "team" }, "pro_seat"),
	plan("pro", { family: "pro" }),
	plan("pro_annual", { family: "pro" }),
	plan("enterprise", {}),
];

describe("currentPlanIdForLegacy", () => {
	test("a released desktop buying the retired Pro ids gets the Pro plan sold today", () => {
		expect(currentPlanIdForLegacy("pro", catalog)).toBe("pro_v2");
		expect(currentPlanIdForLegacy("pro_annual", catalog)).toBe("pro_v2_annual");
	});

	test("leaves other plans, and Pro ids with no Pro family to map to, unchanged", () => {
		expect(currentPlanIdForLegacy("team", catalog)).toBe("team");
		expect(currentPlanIdForLegacy("pro", [])).toBe("pro");
	});
});

describe("heldPlanIdForLegacy", () => {
	test("a released desktop cancelling a Pro plan acts on the Pro plan the organization holds", () => {
		expect(heldPlanIdForLegacy("pro", "pro_v2_annual", catalog)).toBe(
			"pro_v2_annual",
		);
		expect(heldPlanIdForLegacy("pro_annual", "pro", catalog)).toBe("pro");
	});

	test("never resolves to a plan outside the Pro family", () => {
		expect(heldPlanIdForLegacy("pro", "enterprise", catalog)).toBe("pro");
		expect(heldPlanIdForLegacy("pro", "team", catalog)).toBe("pro");
		expect(heldPlanIdForLegacy("pro", null, catalog)).toBe("pro");
		expect(heldPlanIdForLegacy("team", "pro_v2", catalog)).toBe("team");
	});
});
