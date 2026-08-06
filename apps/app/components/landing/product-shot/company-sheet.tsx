import Close from "@carbon/icons-react/es/Close";
import MagicWand from "@carbon/icons-react/es/MagicWand";
import OverflowMenuVertical from "@carbon/icons-react/es/OverflowMenuVertical";
import Renew from "@carbon/icons-react/es/Renew";
import Send from "@carbon/icons-react/es/Send";
import Logo from "@crm/ui/components/logo";
import { cn } from "@crm/ui/lib/utils";
import Image from "next/image";
import { OWNER } from "./companies";
import { CompanyMark } from "./company-mark";

const TABS = [
	{ label: "Overview" },
	{ label: "Contacts", count: "1" },
	{ label: "Deals" },
	{ label: "Activity" },
	{ label: "Agent", active: true },
];

const STATS = [
	{ label: "Open pipeline", value: "$0" },
	{ label: "Open deals", value: "0" },
	{ label: "Next close", value: "—", muted: true },
];

const QUESTIONS = [
	"What do they do?",
	"Who do we know here?",
	"What has changed recently?",
];

/**
 * The record panel, as the app draws it on a wide screen: a sheet pinned to the
 * right of the list. Its mobile twin is `CompanyDrawer`.
 */
export function CompanySheet() {
	return (
		<div className="absolute inset-y-0 right-[1.5px] flex w-[814px] flex-col border-border border-l bg-card shadow-lg">
			<SheetHeader />
			<SheetStats />
			<SheetTabs />
			<AgentEmptyState />
			<SheetComposer />
		</div>
	);
}

function SheetHeader({ compact }: { compact?: boolean }) {
	return (
		<div
			className={cn(
				"flex shrink-0 flex-col border-border border-b py-3",
				compact ? "px-4" : "px-5",
			)}
		>
			<div className="flex items-start gap-3">
				<CompanyMark company={{ name: "Comp AI" }} size={32} glyph={18} />

				<div className="min-w-0 grow pt-0.5">
					<p className="mb-0.5 font-medium text-lg/[125%] tracking-[-0.45px]">
						Comp AI
					</p>
					<p className="text-muted-foreground text-xs/[162.5%]">
						trycomp.ai · Compliance
					</p>
				</div>

				<div className="flex shrink-0 items-center gap-1">
					{compact ? null : (
						<span className="flex h-7 items-center gap-1 rounded-md border border-border bg-muted pr-2.5 pl-1.5 font-medium text-xs/[133%] shadow-2xs">
							<Renew size={14} className="shrink-0" />
							Re-enrich
						</span>
					)}
					<span className="flex h-7 items-center gap-1 rounded-md bg-primary pr-2.5 pl-1.5 font-medium text-primary-foreground text-xs/[133%] shadow-2xs">
						<MagicWand size={14} className="shrink-0" />
						Research
					</span>
					{compact ? null : (
						<>
							<span className="flex size-7 items-center justify-center rounded-md">
								<OverflowMenuVertical size={16} />
							</span>
							<span className="mx-1 h-5 w-px shrink-0 bg-border" />
							<span className="flex size-7 items-center justify-center rounded-md">
								<Close size={16} />
							</span>
						</>
					)}
				</div>
			</div>
		</div>
	);
}

function SheetStats({ compact }: { compact?: boolean }) {
	if (compact) {
		return (
			<div className="grid shrink-0 grid-cols-2 border-border border-b bg-muted/40">
				<Stat label="Open pipeline" value="$0" className="border-r" />
				<Stat label="Open deals" value="0" />
			</div>
		);
	}

	return (
		<div className="flex shrink-0 border-border border-b bg-muted/40">
			{STATS.map((stat) => (
				<Stat
					key={stat.label}
					label={stat.label}
					value={stat.value}
					muted={stat.muted}
					className="grow basis-0 border-r px-5"
				/>
			))}

			<div className="flex min-w-0 grow basis-0 flex-col gap-1 px-5 py-2.5">
				<p className="line-clamp-1 text-muted-foreground text-xs/5">Owner</p>
				<div className="flex min-w-0 items-center gap-2">
					<Image
						src={OWNER.avatar}
						alt=""
						width={24}
						height={24}
						className="size-6 shrink-0 rounded-full object-cover"
					/>
					<span className="line-clamp-1 font-medium text-sm/5">
						{OWNER.name}
					</span>
				</div>
			</div>
		</div>
	);
}

function Stat({
	label,
	value,
	muted,
	className,
}: {
	label: string;
	value: string;
	muted?: boolean;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"flex min-w-0 flex-col gap-1 border-border px-4 py-2.5",
				className,
			)}
		>
			<p className="line-clamp-1 text-muted-foreground text-xs/5">{label}</p>
			<p
				className={cn(
					"truncate font-medium text-sm/5",
					muted ? "text-muted-foreground" : "tabular-nums",
				)}
			>
				{value}
			</p>
		</div>
	);
}

function SheetTabs({ compact }: { compact?: boolean }) {
	return (
		<div
			className={cn(
				"flex h-8 shrink-0 items-center overflow-clip border-border border-b py-[3px]",
				compact ? "gap-4 px-4" : "gap-6 px-5",
			)}
		>
			{TABS.map((tab) => (
				<span
					key={tab.label}
					className={cn(
						"relative flex h-[calc(100%-1px)] shrink-0 items-center gap-1.5 rounded-sm py-0.5 font-medium text-xs/[133%]",
						tab.active ? "text-foreground" : "text-muted-foreground",
					)}
				>
					{tab.label}
					{tab.count ? <span className="tabular-nums">{tab.count}</span> : null}
					{tab.active ? (
						<span className="-bottom-[5px] absolute inset-x-0 h-0.5 bg-foreground" />
					) : null}
				</span>
			))}
		</div>
	);
}

function AgentEmptyState({ compact }: { compact?: boolean }) {
	return (
		<div
			className={cn(
				"flex min-h-0 w-full grow flex-col items-center justify-center overflow-clip px-6",
				compact ? "gap-3 py-4" : "gap-4 py-12",
			)}
		>
			<div className="flex max-w-xl flex-col items-center gap-2">
				<span className="flex shrink-0 items-center justify-center pb-2">
					<span className="flex size-8 shrink-0 items-center justify-center bg-foreground">
						<Logo className="size-4 shrink-0 text-background" />
					</span>
				</span>
				<p className="text-center font-medium text-sm/5">
					Ask about this company
				</p>
				{compact ? null : (
					<p className="text-center text-muted-foreground text-xs/[19px]">
						It reads their site and our own history with them, and shows its
						working.
					</p>
				)}
			</div>

			<div className="flex max-w-2xl flex-wrap items-center justify-center gap-2.5">
				{QUESTIONS.map((question) => (
					<span
						key={question}
						className="flex h-7 shrink-0 items-center rounded-md border border-border bg-muted px-2.5 font-medium text-xs"
					>
						{question}
					</span>
				))}
			</div>
		</div>
	);
}

function SheetComposer({ compact }: { compact?: boolean }) {
	return (
		<div
			className={cn(
				"flex w-full shrink-0 items-center gap-2 border-border border-t py-3",
				compact ? "px-4" : "px-5",
			)}
		>
			<div className="flex h-8 min-w-0 grow items-center rounded-md border border-border px-3">
				<span className="text-muted-foreground text-xs">
					What do they sell?
				</span>
			</div>
			<span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-muted">
				<Send size={14} />
			</span>
		</div>
	);
}

/**
 * The same record on a phone. The app swaps its sheet for a bottom drawer at
 * this width (`components/responsive-sheet.tsx`), so the shot does too —
 * a clipped desktop sheet would be a picture of a product that does not exist.
 */
export function CompanyDrawer() {
	return (
		<div className="absolute inset-x-0 bottom-0 flex h-[440px] flex-col overflow-clip rounded-t-xl border-border border-t bg-card shadow-lg">
			<span className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-border" />
			<SheetHeader compact />
			<SheetStats compact />
			<SheetTabs compact />
			<AgentEmptyState compact />
			<SheetComposer compact />
		</div>
	);
}
