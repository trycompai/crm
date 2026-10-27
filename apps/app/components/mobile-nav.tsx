"use client";

import { useMountEffect } from "@crm/ui/hooks/use-mount-effect";
import { LAYOUT } from "@crm/ui/lib/layout-config";
import { createContext, useContext, useMemo, useState } from "react";

type MobileNavContextValue = {
	open: boolean;
	setOpen: (open: boolean) => void;
};

const MobileNavContext = createContext<MobileNavContextValue | null>(null);

export function MobileNavProvider({ children }: { children: React.ReactNode }) {
	const [open, setOpen] = useState(false);
	useMountEffect(() => {
		const desktop = window.matchMedia(LAYOUT.desktopMediaQuery);
		const closeOnDesktop = () => {
			if (desktop.matches) setOpen(false);
		};
		desktop.addEventListener("change", closeOnDesktop);
		closeOnDesktop();
		return () => desktop.removeEventListener("change", closeOnDesktop);
	});
	const value = useMemo(() => ({ open, setOpen }), [open]);
	return (
		<MobileNavContext.Provider value={value}>
			{children}
		</MobileNavContext.Provider>
	);
}

export function useMobileNav(): MobileNavContextValue {
	const context = useContext(MobileNavContext);
	if (!context) {
		throw new Error("useMobileNav must be used within a MobileNavProvider");
	}
	return context;
}
