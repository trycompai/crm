import Logo from "@crm/ui/components/logo";
import {
	Building2Icon,
	HandshakeIcon,
	LayoutDashboardIcon,
	SettingsIcon,
	UsersIcon,
} from "lucide-react";
import Image from "next/image";
import { BuiltWith } from "../built-with";
import { CompaniesList, CompaniesPage } from "./companies-page";
import { CompanyDrawer, CompanySheet } from "./company-sheet";

const RAIL = [
	{ icon: LayoutDashboardIcon, label: "Overview", active: false },
	{ icon: Building2Icon, label: "Companies", active: true },
	{ icon: UsersIcon, label: "Contacts", active: false },
	{ icon: HandshakeIcon, label: "Deals", active: false },
	{ icon: SettingsIcon, label: "Settings", active: false },
];

export function ProductShot() {
	return (
		<section className="relative flex w-full shrink-0 flex-col items-center px-6 pt-20">
			<div
				role="img"
				aria-label="The companies list with an account open on its Agent tab"
				className="w-[1183px] max-w-full select-none overflow-clip rounded-xl border border-border bg-background"
			>
				<div className="relative hidden h-[690px] w-[1182px] shrink-0 flex-col overflow-clip lg:flex">
					<div className="flex h-full w-[1392px] shrink-0 flex-col">
						<AppHeader />
						<div className="flex min-h-0 grow">
							<AppRail />
							<CompaniesPage />
						</div>
					</div>

					<div className="absolute inset-y-0 right-[211.5px] left-0 bg-black/55 backdrop-blur-[4px]" />
					<CompanySheet />
				</div>

				<div className="relative flex h-[600px] w-full flex-col overflow-clip lg:hidden">
					<AppHeader />
					<CompaniesList />

					<div className="absolute inset-0 bg-black/55 backdrop-blur-[3px]" />
					<CompanyDrawer />
				</div>
			</div>

			<BuiltWith />
		</section>
	);
}

function AppHeader() {
	return (
		<div className="flex h-12 shrink-0 items-center gap-2 border-border border-b px-3">
			<div className="flex shrink-0 items-center gap-1">
				<span className="flex size-8 shrink-0 items-center justify-center">
					<Logo className="size-5 shrink-0 text-foreground" />
				</span>
				<span className="mx-1 h-5 w-px shrink-0" />
				<span className="line-clamp-1 font-medium text-sm/[142%]">
					Comp AI CRM
				</span>
			</div>

			<span className="ml-auto flex size-8 shrink-0 items-center justify-center rounded-md">
				<Image
					src="/landing/avatar-user.png"
					alt=""
					width={28}
					height={28}
					className="size-7 rounded-full object-cover"
				/>
			</span>
		</div>
	);
}

function AppRail() {
	return (
		<div className="flex w-14 shrink-0 flex-col items-center gap-1 border-border border-r py-3">
			{RAIL.map(({ icon: Icon, label, active }) => (
				<span
					key={label}
					className={`flex size-8 shrink-0 items-center justify-center rounded-md ${active ? "bg-muted text-foreground" : "text-muted-foreground"}`}
				>
					<Icon size={16} aria-label={label} />
				</span>
			))}
		</div>
	);
}
