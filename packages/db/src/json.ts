export type FactEvidence = {
	kind: string;
	detail: string;
	sourceUrl?: string;
};

export type WorkspaceProfileSections = {
	sells?: string;
	sellsTo?: string;
	edge?: string;
};

export type ContactBriefSections = {
	currentRole?: string;
	tenure?: string;
	previousRoles?: string[];
	seniority?: string;
	function?: string;
	location?: string;
};
