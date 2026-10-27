import GitHubLogo from "@crm/ui/components/brand-logos/github";
import LinkedInLogo from "@crm/ui/components/brand-logos/linkedin";
import XLogo from "@crm/ui/components/brand-logos/x";
import type { IconComponent } from "@crm/ui/components/icon";
import { BanknoteIcon, UsersIcon } from "lucide-react";

type SocialLink<T> = { key: keyof T; label: string; icon: IconComponent };

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
	{ key: "linkedinUrl", label: "LinkedIn", icon: LinkedInLogo },
	{ key: "twitterUrl", label: "X", icon: XLogo },
	{ key: "githubUrl", label: "GitHub", icon: GitHubLogo },
	{ key: "pricingUrl", label: "Pricing", icon: BanknoteIcon },
	{ key: "careersUrl", label: "Careers", icon: UsersIcon },
];

const CONTACT_LINKS: SocialLink<ContactLinks>[] = [
	{ key: "linkedinUrl", label: "LinkedIn", icon: LinkedInLogo },
	{ key: "twitterUrl", label: "X", icon: XLogo },
	{ key: "githubUrl", label: "GitHub", icon: GitHubLogo },
];

function present<T extends Record<string, string | null>>(
	record: T,
	links: SocialLink<T>[],
) {
	return links.flatMap((link) => {
		const href = record[link.key];
		return href ? [{ ...link, href }] : [];
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
