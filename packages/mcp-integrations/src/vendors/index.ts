import { clerk } from "./clerk";
import { cloudflare } from "./cloudflare";
import { linear } from "./linear";
import { neon } from "./neon";
import { notion } from "./notion";
import { planetscale } from "./planetscale";
import { prisma } from "./prisma";
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
	supabase,
	vercel,
] as const;
