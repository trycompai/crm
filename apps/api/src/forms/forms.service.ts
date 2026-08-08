import { ActivityType, type Db, FormStatus, type Prisma } from "@crm/db";
import {
	BadRequestException,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import { FACET_ALL, type ListResult, paginate } from "../trpc/list-input";
import type {
	FormCreateInput,
	FormFieldInput,
	FormListInput,
} from "./forms.contracts";

type SubmissionData = Record<string, string | number | boolean>;

function normalize(input: string): string {
	return input
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

@Injectable()
export class FormsService {
	constructor(@InjectDatabase() private readonly db: Db) {}

	async list(input: FormListInput): Promise<ListResult<FormRow>> {
		const where: Prisma.FormDefinitionWhereInput = {};
		if (input.q.trim()) {
			where.OR = [
				{ name: { contains: input.q, mode: "insensitive" } },
				{ slug: { contains: input.q, mode: "insensitive" } },
			];
		}
		if (input.status !== FACET_ALL) where.status = input.status as FormStatus;
		if (input.clientAccountId !== FACET_ALL)
			where.clientAccountId = input.clientAccountId;

		const { skip, take } = paginate(input);
		const [rows, total, statusGroups] = await Promise.all([
			this.db.formDefinition.findMany({
				where,
				orderBy: { updatedAt: "desc" },
				skip,
				take,
				include: {
					_count: { select: { submissions: true, fields: true } },
					clientAccount: { select: { id: true, name: true } },
				},
			}),
			this.db.formDefinition.count({ where }),
			this.db.formDefinition.groupBy({
				by: ["status"],
				_count: { _all: true },
			}),
		]);

		const statusFacet: Record<string, number> = {};
		for (const g of statusGroups) statusFacet[g.status] = g._count._all;
		const facetCounts: Record<string, Record<string, number>> = {
			status: statusFacet,
		};

		return {
			rows: rows.map((r) => ({
				id: r.id,
				name: r.name,
				slug: r.slug,
				status: r.status,
				description: r.description,
				fieldCount: r._count.fields,
				submissionCount: r._count.submissions,
				clientAccount: r.clientAccount,
				createdAt: r.createdAt.toISOString(),
				updatedAt: r.updatedAt.toISOString(),
			})),
			total,
			facetCounts,
		};
	}

	async byId(id: string) {
		const form = await this.db.formDefinition.findUnique({
			where: { id },
			include: { fields: { orderBy: { position: "asc" } } },
		});
		if (!form) throw new NotFoundException("Form not found");
		return form;
	}

	async bySlug(slug: string) {
		return this.db.formDefinition.findUnique({
			where: { slug },
			include: { fields: { orderBy: { position: "asc" } } },
		});
	}

	async create(input: FormCreateInput) {
		const slug = await this.uniqueSlug(input.slug ?? input.name);
		return this.db.formDefinition.create({
			data: {
				name: input.name,
				slug,
				description: input.description ?? null,
				status: input.status ?? FormStatus.DRAFT,
				redirectUrl: input.redirectUrl ?? null,
				submitButtonLabel: input.submitButtonLabel ?? "Submit",
				successMessage: input.successMessage ?? "Thanks — we'll be in touch.",
				clientAccountId: input.clientAccountId ?? null,
				createDeal: input.createDeal ?? true,
				dealStage: input.dealStage ?? null,
				tagsToApply: input.tagsToApply ?? [],
				workflowIdOnSubmit: input.workflowIdOnSubmit ?? null,
				fields: {
					create: input.fields.map((f) => this.fieldCreateData(f)),
				},
			},
			include: { fields: true },
		});
	}

	async update(id: string, data: Partial<FormCreateInput>) {
		const existing = await this.db.formDefinition.findUnique({ where: { id } });
		if (!existing) throw new NotFoundException("Form not found");

		return this.db.$transaction(async (tx) => {
			const patch: Prisma.FormDefinitionUpdateInput = {};
			if (data.name !== undefined) patch.name = data.name;
			if (data.slug !== undefined && data.slug !== existing.slug) {
				patch.slug = await this.uniqueSlug(data.slug, id);
			}
			if (data.description !== undefined) patch.description = data.description;
			if (data.status !== undefined) patch.status = data.status;
			if (data.redirectUrl !== undefined) patch.redirectUrl = data.redirectUrl;
			if (data.submitButtonLabel !== undefined)
				patch.submitButtonLabel = data.submitButtonLabel;
			if (data.successMessage !== undefined)
				patch.successMessage = data.successMessage;
			if (data.clientAccountId !== undefined) {
				patch.clientAccount = data.clientAccountId
					? { connect: { id: data.clientAccountId } }
					: { disconnect: true };
			}
			if (data.createDeal !== undefined) patch.createDeal = data.createDeal;
			if (data.dealStage !== undefined) patch.dealStage = data.dealStage;
			if (data.tagsToApply !== undefined) patch.tagsToApply = data.tagsToApply;
			if (data.workflowIdOnSubmit !== undefined)
				patch.workflowIdOnSubmit = data.workflowIdOnSubmit;

			await tx.formDefinition.update({ where: { id }, data: patch });

			if (data.fields) {
				await tx.formField.deleteMany({ where: { formId: id } });
				await tx.formField.createMany({
					data: data.fields.map((f, i) => ({
						formId: id,
						...this.fieldCreateData({ ...f, position: f.position ?? i }),
					})),
				});
			}

			return tx.formDefinition.findUnique({
				where: { id },
				include: { fields: { orderBy: { position: "asc" } } },
			});
		});
	}

	async delete(id: string) {
		try {
			await this.db.formDefinition.delete({ where: { id } });
			return { id };
		} catch {
			throw new NotFoundException("Form not found");
		}
	}

	async submissions(formId: string, page: number, pageSize: number) {
		const { skip, take } = paginate({ page, pageSize });
		const [rows, total] = await Promise.all([
			this.db.formSubmission.findMany({
				where: { formId },
				orderBy: { createdAt: "desc" },
				skip,
				take,
				include: {
					contact: {
						select: {
							id: true,
							firstName: true,
							lastName: true,
							email: true,
						},
					},
				},
			}),
			this.db.formSubmission.count({ where: { formId } }),
		]);
		return {
			rows: rows.map((r) => ({
				id: r.id,
				data: r.data as SubmissionData,
				createdAt: r.createdAt.toISOString(),
				contact: r.contact,
			})),
			total,
		};
	}

	async publicSubmit(input: {
		slug: string;
		data: SubmissionData;
		ipAddress?: string;
		userAgent?: string;
		referrer?: string;
	}) {
		const form = await this.db.formDefinition.findUnique({
			where: { slug: input.slug },
			include: { fields: { orderBy: { position: "asc" } } },
		});
		if (!form || form.status !== FormStatus.PUBLISHED) {
			throw new NotFoundException("Form not found or not published");
		}

		for (const field of form.fields) {
			if (field.required && !input.data[field.key]) {
				throw new BadRequestException(`Missing required field: ${field.label}`);
			}
		}

		const email = (input.data.email as string | undefined)
			?.toLowerCase()
			.trim();
		const first = (input.data.firstName ??
			input.data.first_name ??
			"") as string;
		const last = (input.data.lastName ?? input.data.last_name ?? "") as string;
		const phone = (input.data.phone as string | undefined) ?? null;
		const name = (input.data.name as string | undefined) ?? "";

		let contactId: string | null = null;
		if (email) {
			const existing = await this.db.contact.findUnique({
				where: { email },
			});
			if (existing) {
				contactId = existing.id;
			} else {
				const parts = name ? name.split(" ") : [first, last].filter(Boolean);
				const created = await this.db.contact.create({
					data: {
						firstName: first || parts[0] || "Lead",
						lastName: last || parts.slice(1).join(" ") || null,
						email,
						phone: phone || null,
						clientAccountId: form.clientAccountId,
						tags: form.tagsToApply,
						source: "MANUAL",
					},
				});
				contactId = created.id;
			}
		}

		const submission = await this.db.formSubmission.create({
			data: {
				formId: form.id,
				data: input.data as Prisma.InputJsonValue,
				contactId,
				ipAddress: input.ipAddress ?? null,
				userAgent: input.userAgent ?? null,
				referrer: input.referrer ?? null,
			},
		});

		if (contactId) {
			await this.db.activity
				.create({
					data: {
						type: ActivityType.FORM_SUBMISSION,
						subject: `Submitted ${form.name}`,
						body: JSON.stringify(input.data, null, 2),
						contactId,
						createdById: contactId,
						meta: { formId: form.id, submissionId: submission.id },
					},
				})
				.catch(() => undefined);
		}

		return {
			id: submission.id,
			redirectUrl: form.redirectUrl,
			message: form.successMessage,
		};
	}

	private fieldCreateData(f: FormFieldInput) {
		return {
			key: f.key,
			label: f.label,
			type: f.type,
			required: f.required,
			placeholder: f.placeholder ?? null,
			helpText: f.helpText ?? null,
			options: f.options,
			position: f.position,
		};
	}

	private async uniqueSlug(candidate: string, excludeId?: string) {
		const base = normalize(candidate) || "form";
		let slug = base;
		let n = 1;
		while (true) {
			const clash = await this.db.formDefinition.findFirst({
				where: { slug, id: excludeId ? { not: excludeId } : undefined },
				select: { id: true },
			});
			if (!clash) return slug;
			n += 1;
			slug = `${base}-${n}`;
			if (n > 200) throw new BadRequestException("Could not derive slug");
		}
	}
}

export type FormRow = {
	id: string;
	name: string;
	slug: string;
	status: FormStatus;
	description: string | null;
	fieldCount: number;
	submissionCount: number;
	clientAccount: { id: string; name: string } | null;
	createdAt: string;
	updatedAt: string;
};
