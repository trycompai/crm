"use client";

import Checkmark from "@carbon/icons-react/es/Checkmark";
import WarningAlt from "@carbon/icons-react/es/WarningAlt";
import { DotMatrix } from "@crm/ui/components/dot-matrix";
import { Icon } from "@crm/ui/components/icon";
import { Shimmer } from "@crm/ui/components/shimmer";
import type * as React from "react";

export const TOOL_STEP_STATES = ["pending", "done", "failed"] as const;

export type ToolStepState = (typeof TOOL_STEP_STATES)[number];

const TOOL_STEP_STATUS = {
	pending: "running",
	done: "complete",
	failed: "failed",
} satisfies Record<ToolStepState, string>;

export function ToolStep({
	label,
	state,
	error,
}: {
	label: string;
	state: ToolStepState;
	error?: React.ReactNode;
}) {
	return (
		<div
			className="flex min-w-0 flex-col gap-1"
			data-slot="tool-step"
			data-state={state}
		>
			<div className="flex min-w-0 items-start gap-2 text-sm" role="status">
				<span className="flex h-5 shrink-0 items-center">
					{state === "pending" ? <DotMatrix decorative /> : null}
					{state === "done" ? (
						<Icon className="text-primary" icon={Checkmark} motion="none" />
					) : null}
					{state === "failed" ? (
						<Icon className="text-destructive" icon={WarningAlt} motion="none" />
					) : null}
				</span>
				<span className="min-w-0 wrap-break-word">
					{state === "pending" ? <Shimmer>{label}</Shimmer> : label}
					<span className="sr-only">, {TOOL_STEP_STATUS[state]}</span>
				</span>
			</div>
			{state === "failed" && error ? (
				<p className="wrap-break-word pl-5.5 text-destructive text-xs/5" role="alert">
					{error}
				</p>
			) : null}
		</div>
	);
}
