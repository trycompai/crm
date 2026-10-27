"use client";

import { SHELL } from "@crm/ui/lib/shell-config";
import { cn } from "@crm/ui/lib/utils";
import { MeshGradient } from "@paper-design/shaders-react";
import { Component, type ReactNode, useSyncExternalStore } from "react";

const MOTION_QUERY = "(prefers-reduced-motion: reduce)";

let webGlSupport: boolean | undefined;

function supportsWebGl(): boolean {
	if (webGlSupport === undefined) {
		try {
			webGlSupport = Boolean(
				document.createElement("canvas").getContext("webgl2"),
			);
		} catch {
			webGlSupport = false;
		}
	}
	return webGlSupport;
}

function subscribeToNothing() {
	return () => undefined;
}

function subscribeToTheme(onChange: () => void) {
	const observer = new MutationObserver(onChange);

	observer.observe(document.documentElement, {
		attributes: true,
		attributeFilter: ["class"],
	});

	return () => observer.disconnect();
}

function readColors() {
	const style = getComputedStyle(document.documentElement);

	return SHELL.ink.tokens
		.map((token) => style.getPropertyValue(token).trim())
		.join(" ");
}

function subscribeToMotion(onChange: () => void) {
	const query = window.matchMedia(MOTION_QUERY);

	query.addEventListener("change", onChange);

	return () => query.removeEventListener("change", onChange);
}

class InkFieldBoundary extends Component<
	{ children: ReactNode },
	{ failed: boolean }
> {
	state = { failed: false };

	static getDerivedStateFromError() {
		return { failed: true };
	}

	render() {
		return this.state.failed ? null : this.props.children;
	}
}

function InkField({ className }: { className?: string }) {
	const webGl = useSyncExternalStore(subscribeToNothing, supportsWebGl, () => false);
	const colors = useSyncExternalStore(subscribeToTheme, readColors, () => "");
	const reduced = useSyncExternalStore(
		subscribeToMotion,
		() => window.matchMedia(MOTION_QUERY).matches,
		() => true,
	);

	const mesh = colors.split(" ").filter(Boolean);

	return (
		<div
			aria-hidden
			data-slot="ink-field"
			className={cn(
				"pointer-events-none absolute inset-y-0 left-0 overflow-hidden bg-[var(--rail,#0c1712)]",
				className,
			)}
		>
			{webGl && mesh.length === SHELL.ink.tokens.length ? (
				<InkFieldBoundary>
					<MeshGradient
						className="size-full"
						colors={mesh}
						distortion={SHELL.ink.distortion}
						maxPixelCount={SHELL.ink.maxPixelCount}
						scale={SHELL.ink.scale}
						speed={reduced ? 0 : SHELL.ink.speed}
						swirl={SHELL.ink.swirl}
					/>
				</InkFieldBoundary>
			) : null}
		</div>
	);
}

export { InkField };
