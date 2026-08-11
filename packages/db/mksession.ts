import { signCookieValue } from "../../node_modules/.bun/better-auth@1.6.25+7acd3e1b416146b2/node_modules/better-call/dist/crypto.mjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./src/generated/prisma/client";

const db = new PrismaClient({
	adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const user = await db.user.findFirst({ select: { id: true, email: true } });
if (!user) throw new Error("no user");

const member = await db.member.findFirst({
	where: { userId: user.id },
	select: { organizationId: true },
});

const token = crypto.randomUUID().replace(/-/g, "");
await db.session.create({
	data: {
		id: `probe_${token.slice(0, 12)}`,
		token,
		userId: user.id,
		expiresAt: new Date(Date.now() + 3_600_000),
		activeOrganizationId: member?.organizationId ?? null,
		updatedAt: new Date(),
	},
});

const signed = await signCookieValue(token, process.env.BETTER_AUTH_SECRET!);
const org = member
	? await db.organization.findUnique({
			where: { id: member.organizationId },
			select: { slug: true },
		})
	: null;

console.log(JSON.stringify({ cookie: `crm.session_token=${signed}`, slug: org?.slug, id: `probe_${token.slice(0, 12)}` }));
await db.$disconnect();
