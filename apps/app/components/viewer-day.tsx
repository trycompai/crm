"use client";

import { toDay } from "@crm/ui/lib/format";
import {
	createContext,
	type ReactNode,
	useContext,
	useSyncExternalStore,
} from "react";

const ViewerDayContext = createContext<string | null>(null);

export function ViewerDayProvider({
	initialDay,
	children,
}: {
	initialDay: string;
	children: ReactNode;
}) {
	const day = useSyncExternalStore(subscribe, currentDay, () => initialDay);

	return (
		<ViewerDayContext.Provider value={day}>
			{children}
		</ViewerDayContext.Provider>
	);
}

export function useViewerDay(): string {
	const day = useContext(ViewerDayContext);
	if (day === null) {
		throw new Error("useViewerDay must be used inside ViewerDayProvider.");
	}
	return day;
}

function currentDay(): string {
	return toDay(new Date());
}

function subscribe(onChange: () => void): () => void {
	let timeout: ReturnType<typeof setTimeout>;

	const schedule = () => {
		const now = new Date();
		const tomorrow = new Date(
			now.getFullYear(),
			now.getMonth(),
			now.getDate() + 1,
		);
		timeout = setTimeout(() => {
			onChange();
			schedule();
		}, tomorrow.getTime() - now.getTime());
	};

	schedule();
	return () => clearTimeout(timeout);
}
