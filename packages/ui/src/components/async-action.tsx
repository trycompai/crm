"use client";

import { CircleAlertIcon, CheckIcon } from "lucide-react";
import { domAnimation, LazyMotion, m, useReducedMotion } from "motion/react";
import {
	type ReactNode,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { Spinner } from "@crm/ui/components/spinner";

const TRANSITION = {
	type: "spring",
	stiffness: 520,
	damping: 34,
	mass: 0.45,
} as const;

const INSTANT = { duration: 0 } as const;

export type AsyncActionStatus = "idle" | "pending" | "success" | "error";

export type UseAsyncActionOptions<TArgs extends unknown[], TResult> = {
	action: (...args: TArgs) => TResult | Promise<TResult>;
	resetAfter?: number;
	onSuccess?: (result: TResult) => void;
	onError?: (error: unknown) => void;
};

export function useAsyncAction<TArgs extends unknown[], TResult>({
	action,
	resetAfter = 1400,
	onSuccess,
	onError,
}: UseAsyncActionOptions<TArgs, TResult>) {
	const [status, setStatus] = useState<AsyncActionStatus>("idle");
	const phase = useRef<AsyncActionStatus>("idle");
	const runId = useRef(0);
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const alive = useRef(true);

	const clear = useCallback(() => {
		if (timer.current) {
			clearTimeout(timer.current);
			timer.current = null;
		}
	}, []);

	const reset = useCallback(() => {
		runId.current += 1;
		clear();
		phase.current = "idle";
		setStatus("idle");
	}, [clear]);

	const run = useCallback(
		(...args: TArgs) => {
			if (phase.current === "pending") return;

			clear();
			const id = ++runId.current;
			phase.current = "pending";
			setStatus("pending");

			const settle = (next: "success" | "error") => {
				if (!alive.current || id !== runId.current) return;
				clear();
				phase.current = next;
				setStatus(next);
				timer.current = setTimeout(() => {
					if (!alive.current || id !== runId.current) return;
					phase.current = "idle";
					setStatus("idle");
				}, resetAfter);
			};

			Promise.resolve()
				.then(() => action(...args))
				.then(
					(result) => {
						settle("success");
						onSuccess?.(result);
					},
					(error: unknown) => {
						settle("error");
						onError?.(error);
					},
				);
		},
		[action, clear, onError, onSuccess, resetAfter],
	);

	useEffect(() => {
		alive.current = true;
		return () => {
			alive.current = false;
			clear();
		};
	}, [clear]);

	return {
		status,
		run,
		reset,
		pending: status === "pending",
	};
}

export type AsyncButtonContentProps = {
	status: AsyncActionStatus;
	children: ReactNode;
	pendingLabel: ReactNode;
	successLabel?: ReactNode;
	errorLabel?: ReactNode;
};

export function AsyncButtonContent({
	status,
	children,
	pendingLabel,
	successLabel = "Done",
	errorLabel = "Try again",
}: AsyncButtonContentProps) {
	const reduced = useReducedMotion() === true;
	const states: Array<{ status: AsyncActionStatus; content: ReactNode }> = [
		{ status: "idle", content: children },
		{
			status: "pending",
			content: (
				<>
					<Spinner data-icon="inline-start" aria-hidden />
					{pendingLabel}
				</>
			),
		},
		{
			status: "success",
			content: (
				<>
					<CheckIcon data-icon="inline-start" aria-hidden />
					{successLabel}
				</>
			),
		},
		{
			status: "error",
			content: (
				<>
					<CircleAlertIcon data-icon="inline-start" aria-hidden />
					{errorLabel}
				</>
			),
		},
	];

	return (
		<LazyMotion features={domAnimation}>
			<span className="relative grid min-w-0 items-center justify-items-center">
				{states.map((state) => {
					const active = state.status === status;
					return (
						<m.span
							key={state.status}
							aria-hidden={!active}
							className="col-start-1 row-start-1 inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
							initial={false}
							animate={{
								opacity: active ? 1 : 0,
								scale: reduced || active ? 1 : 0.92,
								filter: reduced || active ? "blur(0px)" : "blur(2px)",
							}}
							transition={reduced ? INSTANT : TRANSITION}
						>
							{state.content}
						</m.span>
					);
				})}
				<span role="status" aria-live="polite" className="sr-only">
					{status === "pending"
						? pendingLabel
						: status === "success"
							? successLabel
							: status === "error"
								? errorLabel
								: ""}
				</span>
			</span>
		</LazyMotion>
	);
}
