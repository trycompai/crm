"use server";

import { db } from "@crm/db";
import { revalidatePath } from "next/cache";
import { ensureDataGearBusinessUnit } from "@/lib/procurement";
import { requireSession } from "@/lib/session";

const text = (value: FormDataEntryValue | null) =>
	typeof value === "string" ? value.trim() : "";

const money = (value: FormDataEntryValue | null) => {
	const raw = text(value);
	if (!raw) return null;

	const parsed = Number(raw);
	if (!Number.isFinite(parsed) || parsed < 0)
		throw new Error("Invalid numeric value");

	return parsed;
};

function refresh(formData: FormData) {
	const slug = text(formData.get("slug"));
	if (slug) revalidatePath(`/${slug}/procurement`);
}

export async function createSupplier(formData: FormData) {
	await requireSession();
	const businessUnit = await ensureDataGearBusinessUnit();
	const supplierName = text(formData.get("supplierName"));

	if (!supplierName) throw new Error("Supplier name is required");

	await db.procurementSupplier.create({
		data: {
			businessUnitId: businessUnit.id,
			supplierName,
			contactName: text(formData.get("contactName")) || null,
			contactEmail: text(formData.get("contactEmail")) || null,
			contactPhone: text(formData.get("contactPhone")) || null,
			paymentTerms: text(formData.get("paymentTerms")) || null,
			notes: text(formData.get("notes")) || null,
		},
	});

	refresh(formData);
}

export async function createProduct(formData: FormData) {
	await requireSession();
	const businessUnit = await ensureDataGearBusinessUnit();
	const category = text(formData.get("category"));
	const productName = text(formData.get("productName"));

	if (!category || !productName)
		throw new Error("Category and product name are required");

	await db.procurementProduct.create({
		data: {
			businessUnitId: businessUnit.id,
			category,
			productName,
			manufacturer: text(formData.get("manufacturer")) || null,
			model: text(formData.get("model")) || null,
			manufacturerSku: text(formData.get("manufacturerSku")) || null,
		},
	});

	refresh(formData);
}

export async function addSupplierQuote(formData: FormData) {
	await requireSession();
	const businessUnit = await ensureDataGearBusinessUnit();
	const supplierId = text(formData.get("supplierId"));
	const productId = text(formData.get("productId"));
	const unitCost = money(formData.get("unitCost"));

	if (!supplierId || !productId || unitCost === null) {
		throw new Error("Supplier, product and unit cost are required");
	}

	const [supplier, product] = await Promise.all([
		db.procurementSupplier.findFirst({
			where: { id: supplierId, businessUnitId: businessUnit.id },
			select: { id: true },
		}),
		db.procurementProduct.findFirst({
			where: { id: productId, businessUnitId: businessUnit.id },
			select: { id: true },
		}),
	]);

	if (!supplier || !product)
		throw new Error("Supplier or product is outside Data-Gear procurement");

	const leadTimeDays = money(formData.get("leadTimeDays"));
	const availabilityStatus = text(formData.get("availabilityStatus"));

	await db.procurementSupplierQuote.create({
		data: {
			supplierId,
			productId,
			supplierSku: text(formData.get("supplierSku")) || null,
			unitCost,
			quoteQuantity: money(formData.get("quoteQuantity")) ?? 1,
			shippingTotal: money(formData.get("shippingTotal")) ?? 0,
			feesPerUnit: money(formData.get("feesPerUnit")) ?? 0,
			otherDirectCostPerUnit:
				money(formData.get("otherDirectCostPerUnit")) ?? 0,
			availableQty: money(formData.get("availableQty")),
			moq: money(formData.get("moq")),
			leadTimeDays: leadTimeDays === null ? null : Number(leadTimeDays),
			availabilityStatus:
				availabilityStatus === "UNAVAILABLE"
					? "UNAVAILABLE"
					: availabilityStatus === "LIVE"
						? "LIVE"
						: "RFQ",
			availabilityCheckedAt: new Date(),
			paymentTerms: text(formData.get("paymentTerms")) || null,
			warranty: text(formData.get("warranty")) || null,
			sourceRef: text(formData.get("sourceRef")) || null,
			notes: text(formData.get("notes")) || null,
		},
	});

	refresh(formData);
}

export async function createCustomerRequest(formData: FormData) {
	await requireSession();
	const businessUnit = await ensureDataGearBusinessUnit();
	const productType = text(formData.get("productType"));
	const quantity = money(formData.get("quantity")) ?? 1;

	if (!productType) throw new Error("Product type is required");

	const selectedProductId = text(formData.get("productId")) || null;
	if (selectedProductId) {
		const selectedProduct = await db.procurementProduct.findFirst({
			where: {
				id: selectedProductId,
				businessUnitId: businessUnit.id,
			},
			select: { id: true },
		});

		if (!selectedProduct)
			throw new Error("Selected product is outside Data-Gear procurement");
	}

	const requiredBy = text(formData.get("requiredBy"));
	const gpuCount = money(formData.get("gpuCount"));
	const ramGb = money(formData.get("ramGb"));

	await db.procurementCustomerRequest.create({
		data: {
			businessUnitId: businessUnit.id,
			customerName: text(formData.get("customerName")) || null,
			contactName: text(formData.get("contactName")) || null,
			contactEmail: text(formData.get("contactEmail")) || null,
			contactPhone: text(formData.get("contactPhone")) || null,
			targetBudget: money(formData.get("targetBudget")),
			destination: text(formData.get("destination")) || null,
			requiredBy: requiredBy ? new Date(requiredBy) : null,
			originalRequest: text(formData.get("originalRequest")) || null,
			notes: text(formData.get("notes")) || null,
			items: {
				create: {
					productId: selectedProductId,
					productType,
					manufacturer: text(formData.get("manufacturer")) || null,
					model: text(formData.get("model")) || null,
					manufacturerSku: text(formData.get("manufacturerSku")) || null,
					quantity,
					gpuModel: text(formData.get("gpuModel")) || null,
					gpuCount: gpuCount === null ? null : Number(gpuCount),
					cpu: text(formData.get("cpu")) || null,
					ramGb: ramGb === null ? null : Number(ramGb),
					storageTb: money(formData.get("storageTb")),
					network: text(formData.get("network")) || null,
					formFactor: text(formData.get("formFactor")) || null,
					preferredManufacturer:
						text(formData.get("preferredManufacturer")) || null,
					customerTargetUnitPrice: money(
						formData.get("customerTargetUnitPrice"),
					),
				},
			},
		},
	});

	refresh(formData);
}
