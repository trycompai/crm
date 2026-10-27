"use client";

import { Spinner } from "@crm/ui/components/spinner";
import {
	CircleCheckIcon,
	InfoIcon,
	Loader2Icon,
	OctagonXIcon,
	TriangleAlertIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const NEO_STYLE = {
	"--width": "420px",
	"--normal-bg": "var(--popover)",
	"--normal-text": "var(--popover-foreground)",
	"--normal-border": "var(--border)",
	"--border-radius": "var(--radius-xl)",
	"--success-bg": "color-mix(in oklab, var(--brand) 6%, var(--popover))",
	"--success-border": "transparent",
	"--success-text": "var(--popover-foreground)",
	"--info-bg": "color-mix(in oklab, var(--status-info) 6%, var(--popover))",
	"--info-border": "transparent",
	"--info-text": "var(--popover-foreground)",
	"--warning-bg":
		"color-mix(in oklab, var(--status-warning) 8%, var(--popover))",
	"--warning-border": "transparent",
	"--warning-text": "var(--popover-foreground)",
	"--error-bg": "color-mix(in oklab, var(--destructive) 6%, var(--popover))",
	"--error-border": "transparent",
	"--error-text": "var(--popover-foreground)",
} as React.CSSProperties;

const CLASSIC_CLASS_NAME = [
	"theme-classic toaster group [--border-radius:5px]!",
	"data-[sonner-theme=light]:[--normal-bg:#ffffff]!",
	"data-[sonner-theme=light]:[--normal-text:#171717]!",
	"data-[sonner-theme=light]:[--normal-border:#e2e2e2]!",
	"data-[sonner-theme=dark]:[--normal-bg:#171717]!",
	"data-[sonner-theme=dark]:[--normal-text:#f5f5f5]!",
	"data-[sonner-theme=dark]:[--normal-border:#2a2a2a]!",
].join(" ");

type ToasterVariant = "default" | "classic";

function subscribeStoredTheme(onChange: () => void) {
	window.addEventListener("storage", onChange);
	return () => window.removeEventListener("storage", onChange);
}

function readStoredTheme(): string | null {
	try {
		return window.localStorage.getItem("theme");
	} catch {
		return null;
	}
}

function noStoredTheme(): null {
	return null;
}

function NeoToaster(props: ToasterProps) {
	const { theme = "system" } = useTheme();

	return (
		<Sonner
			theme={theme as ToasterProps["theme"]}
			position="bottom-right"
			className="toaster group"
			icons={{
				success: <CircleCheckIcon className="size-4 text-brand" />,
				info: <InfoIcon className="size-4 text-status-info" />,
				warning: <TriangleAlertIcon className="size-4 text-status-warning" />,
				error: <OctagonXIcon className="size-4 text-destructive" />,
				loading: (
					<Spinner
						aria-hidden
						aria-label={undefined}
						className="text-muted-foreground"
						role="presentation"
					/>
				),
			}}
			style={NEO_STYLE}
			toastOptions={{
				classNames: {
					toast:
						"cn-toast gap-3! border-0! text-sm! shadow-menu! has-[[data-close-button]]:pr-12!",
					icon: "mx-0! mt-0.5 self-start",
					description: "text-13 text-muted-foreground!",
					actionButton:
						"h-8! rounded-md! bg-primary! px-3! text-sm! text-primary-foreground! hover:bg-primary/80! focus-visible:shadow-focus!",
					cancelButton:
						"h-8! rounded-md! bg-transparent! px-3! text-sm! text-foreground! hover:bg-muted! focus-visible:shadow-focus!",
					closeButton:
						"top-1/2! right-2! left-auto! size-8! -translate-y-1/2 transform-none! rounded-md! border-0! bg-transparent! text-muted-foreground! hover:bg-muted! hover:text-foreground! focus-visible:shadow-focus! [&_svg]:size-4",
				},
			}}
			{...props}
		/>
	);
}

function ClassicToaster(props: ToasterProps) {
	const { theme = "system" } = useTheme();
	const storedTheme = useSyncExternalStore(
		subscribeStoredTheme,
		readStoredTheme,
		noStoredTheme,
	);

	return (
		<Sonner
			theme={(storedTheme ? theme : "system") as ToasterProps["theme"]}
			position="bottom-left"
			className={CLASSIC_CLASS_NAME}
			icons={{
				success: <CircleCheckIcon className="size-4 stroke-2" />,
				info: <InfoIcon className="size-4 stroke-2" />,
				warning: <TriangleAlertIcon className="size-4 stroke-2" />,
				error: <OctagonXIcon className="size-4 stroke-2" />,
				loading: <Loader2Icon className="size-4 animate-spin stroke-2" />,
			}}
			toastOptions={{
				classNames: {
					toast: "cn-toast",
				},
			}}
			{...props}
		/>
	);
}

function Toaster({
	variant = "default",
	...props
}: ToasterProps & { variant?: ToasterVariant }) {
	if (variant === "classic") {
		return <ClassicToaster {...props} />;
	}

	return <NeoToaster {...props} />;
}

export { Toaster, type ToasterVariant };
