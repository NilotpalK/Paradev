import { expect, test } from "bun:test";
import {
	describeMessage,
	readDescribedMessages,
	readDescribedUser,
} from "./tools";

test("a card posted by an app lists with its title and link", () => {
	expect(
		describeMessage({
			ts: "1.2",
			bot_id: "B1",
			text: "",
			attachments: [
				{
					title: "#8195 docs(agents): assign new PRs",
					title_link: "https://github.com/superset-sh/superset/pull/8195",
				},
			],
		}),
	).toBe(
		"[1.2] B1: #8195 docs(agents): assign new PRs https://github.com/superset-sh/superset/pull/8195",
	);
});

test("reads messages back from describeMessage lines, across line breaks", () => {
	const output = [
		"Thread in <#C1> — 2 message(s):",
		"",
		describeMessage({
			ts: "1.000100",
			user: "U1",
			text: "Deploy is red",
			reply_count: 1,
		} as never),
		describeMessage({
			ts: "1.000200",
			user: "U2",
			text: "Fixed in\n#42",
			thread_ts: "1.000100",
		} as never),
	].join("\n");
	expect(readDescribedMessages(output)).toEqual([
		{ ts: "1.000100", sender: "<@U1>", text: "Deploy is red" },
		{ ts: "1.000200", sender: "<@U2>", text: "Fixed in\n#42" },
	]);
});

test("reads a name and title from get_user output", () => {
	expect(
		readDescribedUser(
			"User: <@U1> - Ada Lovelace\nID: U1\nHandle: ada\nTitle: Engineer\n",
		),
	).toEqual({ name: "Ada Lovelace", title: "Engineer" });
	expect(readDescribedUser("Message not found")).toBeNull();
});
