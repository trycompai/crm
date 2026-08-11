"use client";

import {
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerHeader,
	DrawerTitle,
} from "@crm/ui/components/drawer";
import {
	type SheetSize,
	Sheet as UISheet,
	SheetContent as UISheetContent,
	SheetDescription as UISheetDescription,
	SheetHeader as UISheetHeader,
	SheetTitle as UISheetTitle,
} from "@crm/ui/components/sheet";
import { useIsMobile } from "@crm/ui/hooks/use-mobile";
import { cn } from "@crm/ui/lib/utils";
import type * as React from "react";
import { createContext, useContext } from "react";

const ResponsiveContext = createContext(false);
const useResponsive = () => useContext(ResponsiveContext);

type RootProps = {
	open?: boolean;
	defaultOpen?: boolean;
	onOpenChange?: (open: boolean) => void;
	modal?: boolean;
	children?: React.ReactNode;
};

function Sheet({ children, ...props }: RootProps) {
	const isMobile = useIsMobile();
	return (
		<ResponsiveContext.Provider value={isMobile}>
			{isMobile ? (
				<Drawer {...props}>{children}</Drawer>
			) : (
				<UISheet {...props}>{children}</UISheet>
			)}
		</ResponsiveContext.Provider>
	);
}

function SheetContent({
	children,
	side,
	size,
	showCloseButton,
	className,
	...props
}: React.ComponentProps<"div"> & {
	side?: "top" | "right" | "bottom" | "left";
	size?: SheetSize;
	showCloseButton?: boolean;
	onOpenAutoFocus?: (event: Event) => void;
	onCloseAutoFocus?: (event: Event) => void;
}) {
	if (useResponsive()) {
		return (
			<DrawerContent
				className={cn(
					"data-[vaul-drawer-direction=bottom]:h-[88dvh]",
					className,
				)}
				{...props}
			>
				{children}
			</DrawerContent>
		);
	}
	return (
		<UISheetContent
			side={side}
			size={size}
			showCloseButton={showCloseButton}
			className={className}
			{...props}
		>
			{children}
		</UISheetContent>
	);
}

function SheetHeader(props: React.ComponentProps<"div">) {
	return useResponsive() ? (
		<DrawerHeader {...props} />
	) : (
		<UISheetHeader {...props} />
	);
}

function SheetTitle(props: {
	className?: string;
	size?: "default" | "lg";
	children?: React.ReactNode;
}) {
	return useResponsive() ? (
		<DrawerTitle {...props} />
	) : (
		<UISheetTitle {...props} />
	);
}

function SheetDescription(props: {
	className?: string;
	children?: React.ReactNode;
}) {
	return useResponsive() ? (
		<DrawerDescription {...props} />
	) : (
		<UISheetDescription {...props} />
	);
}

export { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle };
