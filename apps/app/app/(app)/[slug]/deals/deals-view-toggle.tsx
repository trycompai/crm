"use client";

import { Button } from "@crm/ui/components/button";
import { cn } from "@crm/ui/lib/utils";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function DealsViewToggle() {
	const params = useSearchParams();
	const router = useRouter();
	const pathname = usePathname();
	const view = params.get("view") ?? "list";

	function set(next: string) {
		const url = new URLSearchParams(params);
		if (next === "list") url.delete("view");
		else url.set("view", next);
		router.replace(`${pathname}?${url.toString()}`);
	}

	return (
		<div className="inline-flex items-center gap-1 rounded-md border bg-muted/30 p-0.5">
			<Button
				type="button"
				size="sm"
				variant="ghost"
				className={cn(
					"h-7 px-2 text-xs",
					view === "list" && "bg-background shadow-sm",
				)}
				onClick={() => set("list")}
			>
				List
			</Button>
			<Button
				type="button"
				size="sm"
				variant="ghost"
				className={cn(
					"h-7 px-2 text-xs",
					view === "board" && "bg-background shadow-sm",
				)}
				onClick={() => set("board")}
			>
				Board
			</Button>
		</div>
	);
}

export function DealsViewSwitch({
	list,
	board,
}: {
	list: React.ReactNode;
	board: React.ReactNode;
}) {
	const params = useSearchParams();
	const view = params.get("view") ?? "list";
	return <>{view === "board" ? board : list}</>;
}
