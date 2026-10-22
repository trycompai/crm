import { afterEach, expect, test } from "bun:test";
import {
	TokenField,
	TokenFieldAction,
	TokenFieldEditable,
} from "@crm/ui/components/token-field";
import { Window } from "happy-dom";
import { createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";

const roots: Array<ReturnType<typeof createRoot>> = [];

afterEach(() => {
	for (const root of roots.splice(0)) root.unmount();
});

test("hides an empty placeholder while the field contains focus", () => {
	const markup = renderToStaticMarkup(
		createElement(TokenField, {
			"data-empty": true,
			"data-placeholder": "Send a message",
		}),
	);

	expect(markup).toContain("focus-within:before:hidden");
});

test("disabled fields block editing and token actions", async () => {
	const { container, render, window } = renderField();
	let actionCount = 0;
	let pointerCount = 0;

	await render(
		createElement(
			TokenField,
			{
				disabled: true,
				tabIndex: 0,
				onPointerDown: () => {
					pointerCount += 1;
				},
			},
			createElement(TokenFieldEditable, { contentEditable: true }, "Draft"),
			createElement(
				TokenFieldAction,
				{
					"aria-label": "Remove item",
					onClick: () => {
						actionCount += 1;
					},
				},
				"Remove",
			),
		),
	);

	const field = container.querySelector<HTMLElement>("[data-slot=token-field]");
	const editable = container.querySelector<HTMLElement>(
		"[data-slot=token-field-editable]",
	);
	const action = container.querySelector<HTMLButtonElement>(
		"[data-slot=token-field-action]",
	);

	expect(field?.getAttribute("aria-disabled")).toBe("true");
	expect(field?.tabIndex).toBe(-1);
	expect(editable?.getAttribute("contenteditable")).toBe("false");
	expect(action?.disabled).toBe(true);
	field?.dispatchEvent(
		new window.PointerEvent("pointerdown", {
			bubbles: true,
			cancelable: true,
		}),
	);
	action?.click();
	expect(pointerCount).toBe(0);
	expect(actionCount).toBe(0);
});

test("loading fields show and announce progress while blocking interaction", async () => {
	const { container, render } = renderField();
	let actionCount = 0;

	await render(
		createElement(
			TokenField,
			{ loading: true, loadingLabel: "Sending message", tabIndex: 0 },
			createElement(TokenFieldEditable, { contentEditable: true }, "Draft"),
			createElement(TokenFieldAction, {
				"aria-label": "Remove item",
				onClick: () => {
					actionCount += 1;
				},
			}),
		),
	);

	const field = container.querySelector<HTMLElement>("[data-slot=token-field]");
	const editable = container.querySelector<HTMLElement>(
		"[data-slot=token-field-editable]",
	);
	const action = container.querySelector<HTMLButtonElement>(
		"[data-slot=token-field-action]",
	);
	const status = container.querySelector<HTMLElement>(
		"[data-slot=token-field-status]",
	);

	expect(field?.getAttribute("aria-busy")).toBe("true");
	expect(field?.getAttribute("aria-disabled")).toBe("true");
	expect(editable?.getAttribute("contenteditable")).toBe("false");
	expect(action?.disabled).toBe(true);
	expect(status?.getAttribute("role")).toBe("status");
	expect(status?.textContent).toBe("Sending message");
	expect(status?.querySelector("[data-slot=spinner]")).not.toBeNull();
	expect(status?.classList.contains("sr-only")).toBe(false);
	action?.click();
	expect(actionCount).toBe(0);
});

test("enabled fields permit editing and token actions", async () => {
	const { container, render } = renderField();
	let actionCount = 0;

	await render(
		createElement(
			TokenField,
			null,
			createElement(TokenFieldEditable, null, "Draft"),
			createElement(TokenFieldAction, {
				"aria-label": "Remove item",
				onClick: () => {
					actionCount += 1;
				},
			}),
		),
	);

	const editable = container.querySelector<HTMLElement>(
		"[data-slot=token-field-editable]",
	);
	const action = container.querySelector<HTMLButtonElement>(
		"[data-slot=token-field-action]",
	);

	expect(editable?.getAttribute("contenteditable")).toBe("true");
	expect(action?.disabled).toBe(false);
	action?.click();
	expect(actionCount).toBe(1);
});

function renderField() {
	const window = new Window();
	Object.assign(globalThis, {
		window,
		document: window.document,
		HTMLElement: window.HTMLElement,
		Node: window.Node,
	});
	const container = document.createElement("div");
	document.body.append(container);
	const root = createRoot(container);
	roots.push(root);
	return {
		container,
		window,
		render: async (element: ReactNode) => {
			root.render(element);
			await new Promise((resolve) => setTimeout(resolve, 0));
		},
	};
}
