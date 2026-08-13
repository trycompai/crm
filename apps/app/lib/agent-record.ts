import type { CarbonIcon } from "@crm/ui/components/icon";

export type AgentRecordKind =
	| "contact"
	| "company"
	| "deal"
	| "campaign"
	| "segment"
	| "template"
	| "shell";

export type CampaignKind = "BLAST" | "DRIP";

export type AgentRecord = {
	kind: AgentRecordKind;
	id: string;
	nodeId?: string;
	campaignKind?: CampaignKind;
	empty?: boolean;
};

export type AgentRecordFilter = {
	contactId?: string;
	companyId?: string;
	dealId?: string;
	campaignId?: string;
	campaignNodeId?: string;
	segmentId?: string;
	templateId?: string;
	shellId?: string;
};

type RecordCopy = {
	header: string;
	field:
		| "contactId"
		| "companyId"
		| "dealId"
		| "campaignId"
		| "segmentId"
		| "templateId"
		| "shellId";
	title: string;
	blurb: string;
	placeholder: string;
	suggestions: string[];
};

const COPY: Record<AgentRecordKind, RecordCopy> = {
	contact: {
		header: "x-crm-contact",
		field: "contactId",
		title: "Ask about this person",
		blurb:
			"Every step is shown as it happens — including the leads it throws away.",
		placeholder: "Are they still there?",
		suggestions: [
			"Who is this person?",
			"Are they still there?",
			"What should I know before a call?",
		],
	},
	company: {
		header: "x-crm-company",
		field: "companyId",
		title: "Ask about this company",
		blurb:
			"It reads their site and our own history with them, and shows its working.",
		placeholder: "What do they sell?",
		suggestions: [
			"What do they do?",
			"Who do we know here?",
			"What has changed recently?",
		],
	},
	deal: {
		header: "x-crm-deal",
		field: "dealId",
		title: "Ask about this deal",
		blurb:
			"It can read the thread, the meetings and the people on both sides of it.",
		placeholder: "Where has this stalled?",
		suggestions: [
			"Where does this stand?",
			"Who else should be involved?",
			"What is the risk here?",
		],
	},
	campaign: {
		header: "x-crm-campaign",
		field: "campaignId",
		title: "Build this campaign",
		blurb:
			"Describe the steps and it builds the flow. It edits drafts; you activate it.",
		placeholder:
			"Four emails over two weeks, branching on whether they opened.",
		suggestions: [
			"Add a wait and a follow-up after the first email",
			"Branch after the first email on whether they clicked",
			"Make the second email shorter",
		],
	},
	segment: {
		header: "x-crm-segment",
		field: "segmentId",
		title: "Describe who is in this segment",
		blurb:
			"Say it in plain English. The agent writes the rules on the left, and you can still edit every one yourself.",
		placeholder: "People who hit pricing twice and never replied.",
		suggestions: [
			"Everyone who visited pricing and has no open deal",
			"Signed up but never logged in",
			"Drop anyone we spoke to this month",
		],
	},
	shell: {
		header: "x-crm-shell",
		field: "shellId",
		title: "Write this header or footer",
		blurb:
			"Every email carries it. The postal address and the unsubscribe link are added on every send and cannot move.",
		placeholder: "Put our logo at the top and a thin rule under it.",
		suggestions: [
			"Put our logo at the top",
			"Add a line about why they are getting this",
			"Make the footer shorter",
		],
	},
	template: {
		header: "x-crm-template",
		field: "templateId",
		title: "Write this email",
		blurb:
			"It writes the body only. The header and footer come from your default template.",
		placeholder: "Make this shorter and lead with the customer.",
		suggestions: [
			"Make this shorter",
			"Lead with the customer, not us",
			"Add a closing line about the Thursday walkthrough",
		],
	},
};

const CAMPAIGN_EMAIL_COPY: RecordCopy = {
	header: COPY.campaign.header,
	field: COPY.campaign.field,
	title: "Write this email",
	blurb:
		"It edits this step only — subject, preheader and body. The rest of the flow stays put.",
	placeholder: "Make this shorter and end with a clear ask.",
	suggestions: [
		"Write a first draft of this email",
		"Make it shorter",
		"Give it a subject line people open",
	],
};

const CAMPAIGN_BLAST_COPY: RecordCopy = {
	header: COPY.campaign.header,
	field: COPY.campaign.field,
	title: "Send one great email",
	blurb:
		"One email, one audience, one send. It drafts and edits; you pick who gets it and press send.",
	placeholder: "Announce the new pricing page to everyone on the list.",
	suggestions: [
		"Write a first draft of this email",
		"Give it a subject line people open",
		"Who should get this, and when should it go out?",
	],
};

const NEW_TEMPLATE_COPY: RecordCopy = {
	header: COPY.template.header,
	field: COPY.template.field,
	title: "Write this email",
	blurb:
		"Say who it is for and it writes the body. The header and footer come from your default template.",
	placeholder: "A welcome email for people who just signed up.",
	suggestions: [
		"Write a welcome email for new signups",
		"Write a follow-up for after a demo",
		"Announce a new feature to our customers",
	],
};

export function recordCopy(
	record: Pick<AgentRecord, "kind" | "nodeId" | "campaignKind" | "empty">,
): RecordCopy {
	if (record.kind === "template") {
		return record.empty ? NEW_TEMPLATE_COPY : COPY.template;
	}
	if (record.kind !== "campaign") return COPY[record.kind];
	if (record.nodeId) return CAMPAIGN_EMAIL_COPY;
	if (record.campaignKind === "BLAST") return CAMPAIGN_BLAST_COPY;
	return COPY.campaign;
}

export function recordHeader(record: AgentRecord) {
	if (record.kind === "campaign" && record.nodeId) {
		return {
			[COPY.campaign.header]: record.id,
			"x-crm-campaign-node": record.nodeId,
		};
	}
	return { [COPY[record.kind].header]: record.id };
}

export function recordFilter(record: AgentRecord): AgentRecordFilter {
	if (record.kind === "campaign" && record.nodeId) {
		return { campaignId: record.id, campaignNodeId: record.nodeId };
	}
	return { [COPY[record.kind].field]: record.id };
}

export type { CarbonIcon };
