"use client";

import { createContext, useContext, useMemo, useState } from "react";

type MobileNavContextValue = {
	open: boolean;
	setOpen: (open: boolean) => void;
};

const MobileNavContext = createContext<MobileNavContextValue | null>(null);

export function MobileNavProvider({ children }: { children: React.ReactNode }) {
	const [open, setOpen] = useState(false);
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
