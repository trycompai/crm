"use client";

import { Skeleton } from "@crm/ui/components/skeleton";
import { cn } from "@crm/ui/lib/utils";
import { domAnimation, LazyMotion, m, useReducedMotion } from "motion/react";
import {
	type ReactNode,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";

const CROSSFADE = {
	type: "spring",
	stiffness: 260,
	damping: 34,
	mass: 0.8,
} as const;

const INSTANT = { duration: 0 } as const;

export type SkeletonSwapProps = {
	loading: boolean;
	children: ReactNode;
	skeleton?: ReactNode;
	delay?: number;
	minVisible?: number;
	label?: string;
	className?: string;
};

export function SkeletonSwap({
	loading,
	children,
	skeleton,
	delay = 120,
	minVisible = 380,
	label,
	className,
}: SkeletonSwapProps) {
	const [showSkeleton, setShowSkeleton] = useState(false);
	const shownAt = useRef(0);
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const reduced = useReducedMotion() === true;

	const clear = useCallback(() => {
		if (timer.current) {
			clearTimeout(timer.current);
			timer.current = null;
		}
	}, []);

	const bind = useCallback(
		(node: HTMLDivElement | null) => {
			if (!node) return;
			clear();

			if (loading && !showSkeleton) {
				timer.current = setTimeout(() => {
					shownAt.current = performance.now();
					setShowSkeleton(true);
				}, delay);
				return;
			}

			if (!loading && showSkeleton) {
				const remaining = Math.max(
					0,
					minVisible - (performance.now() - shownAt.current),
				);
				timer.current = setTimeout(() => setShowSkeleton(false), remaining);
			}
		},
		[clear, delay, loading, minVisible, showSkeleton],
	);

	useEffect(() => clear, [clear]);

	return (
		<LazyMotion features={domAnimation}>
			<div
				ref={bind}
				aria-busy={loading}
				aria-label={label}
				className={cn("relative grid min-w-0", className)}
			>
				<m.div
					inert={showSkeleton ? true : undefined}
					aria-hidden={showSkeleton}
					className="col-start-1 row-start-1 min-w-0"
					initial={false}
					animate={{
						opacity: showSkeleton ? 0 : 1,
						scale: reduced || !showSkeleton ? 1 : 0.99,
						filter: reduced || !showSkeleton ? "blur(0px)" : "blur(3px)",
					}}
					transition={reduced ? INSTANT : CROSSFADE}
					style={{
						transformOrigin: "top left",
						pointerEvents: showSkeleton ? "none" : undefined,
					}}
				>
					{children}
				</m.div>
				<m.div
					aria-hidden
					className="pointer-events-none col-start-1 row-start-1 min-w-0"
					initial={false}
					animate={{
						opacity: showSkeleton ? 1 : 0,
						filter: reduced || showSkeleton ? "blur(0px)" : "blur(3px)",
					}}
					transition={reduced ? INSTANT : CROSSFADE}
				>
					{skeleton ?? <DefaultSkeleton />}
				</m.div>
				{label ? (
					<span role="status" aria-live="polite" className="sr-only">
						{loading ? "" : `${label} loaded`}
					</span>
				) : null}
			</div>
		</LazyMotion>
	);
}

function DefaultSkeleton() {
	return (
		<div className="flex flex-col gap-2">
			<Skeleton className="h-4 w-full" />
			<Skeleton className="h-4 w-11/12" />
			<Skeleton className="h-4 w-8/12" />
		</div>
	);
}
