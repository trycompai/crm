import { type Handoff, schemas } from "@crm/validation";

export function handoffResources(handoff: Handoff) {
	return [
		{
			kind: "integration" as const,
			id: "slack:workspace",
			label: "Slack",
			detail: "Connected workspace",
		},
		...(handoff.channel
			? [
					{
						kind: "integration" as const,
						id: `slack:channel:${handoff.channel.id}`,
						label: `#${handoff.channel.name}`,
						detail: handoff.channel.isMember
							? "Comp AI is a member"
							: "Comp AI is not in this channel yet",
					},
				]
			: []),
	];
}

export function handoffBrief(handoff: Handoff): string {
	const lines = [`Build an agent named "${handoff.name}".`, handoff.job];

	if (handoff.channel) {
		lines.push(
			`It posts to the tagged Slack channel #${handoff.channel.name} and nowhere else. Do not ask me where to post.`,
		);
	}

	lines.push(
		[
			"These Slack permissions are already decided. Use exactly this list and do not ask about it:",
			...schemas.agents.permissions.map(
				(entry) =>
					`- ${entry.label}: ${handoff.allowed.includes(entry.id) ? "allowed" : "not allowed"}`,
			),
		].join("\n"),
	);

	return lines.join("\n\n");
}
