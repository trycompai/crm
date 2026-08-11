import { db } from "@crm/db";
import { blobEnabled, isMirrored, mirror } from "@crm/db/blob";
import { providerMutationsPaused } from "./autonomy";
import { findPortrait, type PortraitSource } from "./portrait-sources";
import { type TaskLeaseScope, withTaskLease } from "./tasks";

export type PortraitResult = {
	stored: boolean;
	imageUrl: string | null;
	source?: PortraitSource;
	reason?: string;
};

export async function storePortrait({
	contactId,
	sourceUrl,
	verified,
	force = false,
	lease,
}: {
	contactId: string;
	sourceUrl: string | null;
	verified: boolean;
	force?: boolean;
	lease?: TaskLeaseScope;
}): Promise<PortraitResult> {
	if (!sourceUrl) {
		return {
			stored: false,
			imageUrl: null,
			reason: "No photo on the profile.",
		};
	}

	if (!verified) {
		return {
			stored: false,
			imageUrl: null,
			reason:
				"The profile was not established to be this person, so its photo is not theirs to use.",
		};
	}

	if (providerMutationsPaused()) {
		return {
			stored: false,
			imageUrl: null,
			reason: "Provider mutations are paused.",
		};
	}

	if (!blobEnabled()) {
		return {
			stored: false,
			imageUrl: null,
			reason:
				"This install has no BLOB_READ_WRITE_TOKEN, so there is nowhere to keep a copy. " +
				"The source URL expires within weeks and is never stored. Retrying will not help.",
		};
	}

	const contact = await db.contact.findUnique({
		where: { id: contactId },
		select: { imageUrl: true },
	});

	if (!contact) {
		return { stored: false, imageUrl: null, reason: "No such contact." };
	}

	if (!force && isMirrored(contact.imageUrl)) {
		return {
			stored: false,
			imageUrl: contact.imageUrl,
			reason: "They already have a photo.",
		};
	}

	if (lease) {
		const active = await withTaskLease(
			{ ...lease, contactId, minRemainingMs: 30_000 },
			async () => true,
		);
		if (!active.owned) return leaseLost(contact.imageUrl);
	}

	const stored = await mirror(sourceUrl, `contacts/${contactId}`);

	if (!stored) {
		return {
			stored: false,
			imageUrl: contact.imageUrl,
			reason: "The photo could not be fetched. The record is unchanged.",
		};
	}

	if (stored === contact.imageUrl) {
		return { stored: false, imageUrl: stored, reason: "Unchanged." };
	}

	const write = async (client: Pick<typeof db, "contact">) =>
		client.contact.updateMany({
			where: { id: contactId, imageUrl: contact.imageUrl },
			data: { imageUrl: stored },
		});
	const updated = lease
		? await withTaskLease({ ...lease, contactId }, write)
		: { owned: true as const, value: await write(db) };
	if (!updated.owned) return leaseLost(contact.imageUrl);
	if (updated.value.count !== 1) {
		return {
			stored: false,
			imageUrl: contact.imageUrl,
			reason: "The contact changed while the photo was being copied.",
		};
	}

	return { stored: true, imageUrl: stored };
}

export async function runPortrait({
	contactId,
	spend,
	force = false,
	lease,
}: {
	contactId: string;
	spend: (units?: number) => { ok: boolean; reason?: string };
	force?: boolean;
	lease?: TaskLeaseScope;
}): Promise<PortraitResult> {
	if (providerMutationsPaused()) {
		return {
			stored: false,
			imageUrl: null,
			reason: "Provider mutations are paused.",
		};
	}

	if (!blobEnabled()) {
		return {
			stored: false,
			imageUrl: null,
			reason:
				"This install has no BLOB_READ_WRITE_TOKEN, so there is nowhere to keep a copy. Retrying will not help.",
		};
	}

	const contact = await db.contact.findUnique({
		where: { id: contactId },
		select: {
			id: true,
			firstName: true,
			lastName: true,
			imageUrl: true,
			linkedinUrl: true,
			githubUrl: true,
			company: { select: { name: true, domain: true } },
		},
	});

	if (!contact) {
		return { stored: false, imageUrl: null, reason: "No such contact." };
	}

	if (!force && contact.imageUrl) {
		return {
			stored: false,
			imageUrl: contact.imageUrl,
			reason: "They already have a photo.",
		};
	}

	const found = await findPortrait(
		{
			id: contact.id,
			name:
				[contact.firstName, contact.lastName].filter(Boolean).join(" ") || null,
			linkedinUrl: contact.linkedinUrl,
			githubUrl: contact.githubUrl,
			companyName: contact.company?.name ?? null,
			companyDomain: contact.company?.domain ?? null,
		},
		spend,
	);

	if (!found.found) {
		return {
			stored: false,
			imageUrl: contact.imageUrl,
			reason:
				found.reason ??
				(found.tried.length > 0
					? `No picture found. Tried: ${found.tried.join("; ")}.`
					: "Nothing on this contact points at a picture — no LinkedIn or GitHub profile, and no company website."),
		};
	}

	const result = await storePortrait({
		contactId,
		sourceUrl: found.candidate.url,
		verified: true,
		force,
		lease,
	});

	return { ...result, source: found.candidate.source };
}

function leaseLost(imageUrl: string | null): PortraitResult {
	return {
		stored: false,
		imageUrl,
		reason: "The task lease is no longer active.",
	};
}
