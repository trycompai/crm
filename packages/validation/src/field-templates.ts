export type FieldTemplate = {
	label: string;
	type: "SELECT" | "USER" | "NUMBER";
	options?: readonly string[];
};

export const FIELD_TEMPLATES = {
	COMPANY: [
		{
			label: "Account type",
			type: "SELECT",
			options: ["Prospect", "Customer", "Partner", "Churned"],
		},
		{
			label: "Segment",
			type: "SELECT",
			options: ["Enterprise", "Mid-Market", "SMB"],
		},
		{
			label: "Territory",
			type: "SELECT",
			options: ["AMER", "EMEA", "APAC"],
		},
		{
			label: "Lifecycle stage",
			type: "SELECT",
			options: ["Lead", "MQL", "SQL", "Opportunity", "Customer"],
		},
		{
			label: "Lead source",
			type: "SELECT",
			options: ["Inbound", "Outbound", "Event"],
		},
		{ label: "ICP fit score", type: "NUMBER" },
		{ label: "BDR owner", type: "USER" },
	],
	CONTACT: [],
	DEAL: [],
} satisfies Record<"COMPANY" | "CONTACT" | "DEAL", readonly FieldTemplate[]>;
