import { clerk } from "./clerk";
import { cloudflare } from "./cloudflare";
import { linear } from "./linear";
import { neon } from "./neon";
import { notion } from "./notion";
import { planetscale } from "./planetscale";
import { prisma } from "./prisma";
import { specstream } from "./specstream";
import { supabase } from "./supabase";
import { vercel } from "./vercel";

export const vendors = [
	clerk,
	cloudflare,
	linear,
	neon,
	notion,
	planetscale,
	prisma,
	specstream,
	supabase,
	vercel,
] as const;
