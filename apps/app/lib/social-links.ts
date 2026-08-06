import LogoGithub from "@carbon/icons-react/es/LogoGithub";
import LogoLinkedin from "@carbon/icons-react/es/LogoLinkedin";
import LogoX from "@carbon/icons-react/es/LogoX";
import Money from "@carbon/icons-react/es/Money";
import UserMultiple from "@carbon/icons-react/es/UserMultiple";
import type { CarbonIcon } from "@crm/ui/components/icon";

type SocialLink<T> = { key: keyof T; label: string; icon: CarbonIcon };

export type CompanyLinks = {
	linkedinUrl: string | null;
	twitterUrl: string | null;
	githubUrl: string | null;
	pricingUrl: string | null;
	careersUrl: string | null;
};

export type ContactLinks = {
	linkedinUrl: string | null;
	twitterUrl: string | null;
	githubUrl: string | null;
};

const COMPANY_LINKS: SocialLink<CompanyLinks>[] = [
	{ key: "linkedinUrl", label: "LinkedIn", icon: LogoLinkedin },
	{ key: "twitterUrl", label: "X", icon: LogoX },
	{ key: "githubUrl", label: "GitHub", icon: LogoGithub },
	{ key: "pricingUrl", label: "Pricing", icon: Money },
	{ key: "careersUrl", label: "Careers", icon: UserMultiple },
];

const CONTACT_LINKS: SocialLink<ContactLinks>[] = [
	{ key: "linkedinUrl", label: "LinkedIn", icon: LogoLinkedin },
	{ key: "twitterUrl", label: "X", icon: LogoX },
	{ key: "githubUrl", label: "GitHub", icon: LogoGithub },
];

function present<T>(record: T, links: SocialLink<T>[]) {
	return links.flatMap((link) => {
		const href = record[link.key];
		return typeof href === "string" && href ? [{ ...link, href }] : [];
	});
}

export function companySocialLinks(company: CompanyLinks) {
	return present(company, COMPANY_LINKS);
}

export function contactSocialLinks(contact: ContactLinks) {
	return present(contact, CONTACT_LINKS);
}

export function hasCompanyLinks(company: CompanyLinks): boolean {
	return companySocialLinks(company).length > 0;
}

export function hasContactLinks(contact: ContactLinks): boolean {
	return contactSocialLinks(contact).length > 0;
}
