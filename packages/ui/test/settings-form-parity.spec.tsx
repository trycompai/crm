import { afterEach, expect, mock, test } from "bun:test";
import { Window } from "happy-dom";
import {
	type ComponentProps,
	type ReactNode,
	StrictMode,
	useRef,
	useState,
} from "react";

if (process.env.CRM_SETTINGS_FORM_TEST_CHILD !== "1") {
	test("settings form behaviors pass in an isolated DOM", () => {
		const result = Bun.spawnSync(["bun", "test", import.meta.path], {
			env: { ...process.env, CRM_SETTINGS_FORM_TEST_CHILD: "1" },
			stdout: "pipe",
			stderr: "pipe",
		});
		expect(new TextDecoder().decode(result.stderr)).not.toContain("(fail)");
		expect(result.exitCode).toBe(0);
	});
} else {
	const browser = new Window({ url: "http://localhost" });
	Object.assign(globalThis, {
		window: browser,
		document: browser.document,
		navigator: browser.navigator,
		location: browser.location,
		history: browser.history,
		HTMLElement: browser.HTMLElement,
		HTMLInputElement: browser.HTMLInputElement,
		HTMLFormElement: browser.HTMLFormElement,
		HTMLSelectElement: browser.HTMLSelectElement,
		HTMLTextAreaElement: browser.HTMLTextAreaElement,
		Node: browser.Node,
		DocumentFragment: browser.DocumentFragment,
		NodeFilter: browser.NodeFilter,
		Element: browser.Element,
		Event: browser.Event,
		CustomEvent: browser.CustomEvent,
		MutationObserver: browser.MutationObserver,
		getComputedStyle: browser.getComputedStyle.bind(browser),
		CSS: browser.CSS,
		requestAnimationFrame: browser.requestAnimationFrame.bind(browser),
		cancelAnimationFrame: browser.cancelAnimationFrame.bind(browser),
	});
	const successes: string[] = [];
	const failures: string[] = [];
	const permission = { canConfigure: true, canManage: true, pending: false };
	const manualRates: Array<{ currency: string; rate: number }> = [];
	const submitted: Array<{
		providerId: string;
		issuer: string;
		domain: string;
		clientId: string;
		clientSecret: string;
	}> = [];
	mock.module("sonner", () => ({
		toast: {
			success: (message: string) => successes.push(message),
			error: (message: string) => failures.push(message),
		},
	}));
	mock.module("../../../apps/app/lib/trpc/client", () => ({
		useTRPC: () => ({
			sso: {
				settings: { queryOptions: () => ({}) },
				register: { mutationOptions: () => ({}) },
			},
			currency: {
				settings: { queryOptions: () => ({ kind: "currency" }) },
				setReportingCurrency: {
					mutationOptions: () => ({ kind: "currency-other" }),
				},
				setManualRate: {
					mutationOptions: (options: { onSuccess: () => Promise<void> }) => ({
						...options,
						kind: "manual-rate",
					}),
				},
				removeManualRate: {
					mutationOptions: () => ({ kind: "currency-other" }),
				},
				refreshRates: { mutationOptions: () => ({ kind: "currency-other" }) },
			},
			apiKeys: {
				create: {
					mutationOptions: (options: {
						onSuccess: (key: typeof fixtureKey) => Promise<void>;
					}) => options,
				},
			},
		}),
	}));
	mock.module("../../../apps/app/lib/trpc/cache", () => ({
		useCrmCache: () => ({
			sso: async () => undefined,
			apiKeys: async () => undefined,
			currency: async () => undefined,
		}),
	}));
	mock.module("@tanstack/react-query", () => ({
		useQuery: (options: { kind?: string }) => ({
			data:
				options.kind === "currency"
					? {
							reportingCurrency: "USD",
							refreshedAt: null,
							rates: [],
							inUse: [],
							unconverted: { count: 0, currencies: [] },
							catalog: [],
							canManage: permission.canManage,
						}
					: {
							canConfigure: permission.canConfigure,
							callbackBase: "https://example.test/sso",
						},
		}),
		useMutation: (options: {
			kind?: string;
			onSuccess?: (key: typeof fixtureKey) => Promise<void>;
		}) => ({
			isPending: permission.pending,
			mutate: (
				input: (typeof submitted)[number] | (typeof manualRates)[number],
			) => {
				if (options.kind === "currency-other")
					throw new Error("Unexpected currency operation");
				if (options.kind === "manual-rate" && "currency" in input) {
					manualRates.push(input);
					void options.onSuccess?.(fixtureKey);
				} else if (options.onSuccess) void options.onSuccess(fixtureKey);
				else if ("providerId" in input) submitted.push(input);
			},
		}),
	}));
	const { createRoot } = await import("react-dom/client");
	const { NuqsTestingAdapter } = await import("nuqs/adapters/testing");
	const { CreatedApiKeyDialog } = await import(
		"../../../apps/app/app/(app)/[slug]/settings/api-keys/created-api-key-dialog"
	);
	const { CreateApiKeySheet } = await import(
		"../../../apps/app/app/(app)/[slug]/settings/api-keys/create-api-key-sheet"
	);
	const { CopyValue } = await import(
		"../../../apps/app/app/(app)/[slug]/settings/copy-value"
	);
	const { AddSsoProviderSheet } = await import(
		"../../../apps/app/app/(app)/[slug]/settings/sso/add-sso-provider-sheet"
	);
	const { CurrencySettings } = await import(
		"../../../apps/app/app/(app)/[slug]/settings/currencies/currency-settings"
	);
	const roots: Array<ReturnType<typeof createRoot>> = [];
	const fixtureKey = {
		id: "fixture-key-1",
		name: "Fixture key",
		start: "fixture",
		enabled: true,
		createdAt: "2026-10-26T00:00:00.000Z",
		lastRequest: null,
		expiresAt: null,
		key: "fixture-only-key",
	} satisfies NonNullable<ComponentProps<typeof CreatedApiKeyDialog>["apiKey"]>;

	afterEach(async () => {
		for (const root of roots.splice(0)) root.unmount();
		await settle();
		document.body.innerHTML = "";
		successes.length = 0;
		failures.length = 0;
		submitted.length = 0;
		manualRates.length = 0;
		permission.canConfigure = true;
		permission.canManage = true;
		permission.pending = false;
		clipboard(async () => undefined);
	});

	function clipboard(writeText: ((value: string) => Promise<void>) | null) {
		Object.defineProperty(browser.navigator, "clipboard", {
			configurable: true,
			value: writeText ? { writeText } : undefined,
		});
	}

	async function settle() {
		await new Promise((resolve) => setTimeout(resolve, 25));
	}

	async function render(element: ReactNode) {
		const container = document.createElement("div");
		document.body.append(container);
		const root = createRoot(container);
		roots.push(root);
		root.render(<StrictMode>{element}</StrictMode>);
		await settle();
		return root;
	}

	function button(label: string) {
		const scope =
			document.querySelector('[role="alertdialog"][data-state="open"]') ??
			document.querySelector(
				'[data-slot="dialog-content"][data-state="open"], [data-slot="sheet-content"][data-state="open"]',
			) ??
			document;
		const found = [...scope.querySelectorAll<HTMLButtonElement>("button")].find(
			(item) => item.textContent?.trim() === label,
		);
		if (!found) throw new Error(`Missing button: ${label}`);
		return found;
	}

	async function click(label: string) {
		button(label).click();
		await settle();
	}

	async function pressEscape() {
		document.activeElement?.dispatchEvent(
			new browser.KeyboardEvent("keydown", {
				key: "Escape",
				bubbles: true,
				cancelable: true,
			}),
		);
		await settle();
	}

	function revealOpen() {
		return (
			document.querySelector(
				'[data-slot="dialog-content"][data-state="open"]',
			) !== null
		);
	}

	function confirmationOpen() {
		return (
			document.querySelector('[role="alertdialog"][data-state="open"]') !== null
		);
	}

	function RevealFixture() {
		const [key, setKey] = useState<typeof fixtureKey | null>(fixtureKey);
		const trigger = useRef<HTMLButtonElement>(null);
		return (
			<>
				<button ref={trigger} type="button" onClick={() => setKey(fixtureKey)}>
					New API key
				</button>
				<CreatedApiKeyDialog
					apiKey={key}
					onOpenChange={(open) => {
						if (!open) setKey(null);
					}}
					onCloseAutoFocus={(event) => {
						event.preventDefault();
						trigger.current?.focus();
					}}
				/>
			</>
		);
	}

	for (const close of ["Done", "Close", "Escape"]) {
		test(`uncopied ${close} asks; Go back and confirmation Escape retain the fixture key`, async () => {
			await render(<RevealFixture />);
			if (close === "Escape") await pressEscape();
			else await click(close);
			expect(revealOpen()).toBe(true);
			expect(confirmationOpen()).toBe(true);
			expect(document.activeElement?.textContent).toBe("Go back to the key");
			await pressEscape();
			expect(confirmationOpen()).toBe(false);
			expect(revealOpen()).toBe(true);
			expect(
				document.activeElement?.closest('[data-slot="dialog-content"]'),
			).not.toBeNull();
			expect(document.querySelector<HTMLInputElement>("input")?.value).toBe(
				fixtureKey.key,
			);
			await click("Done");
			await click("Go back to the key");
			expect(revealOpen()).toBe(true);
			await click("Done");
			await click("Close anyway");
			expect(revealOpen()).toBe(false);
			expect(document.activeElement?.textContent).toBe("New API key");
		});
	}

	test("outside presses never dismiss the one-time key", async () => {
		await render(<RevealFixture />);
		document.body.dispatchEvent(
			new browser.PointerEvent("pointerdown", {
				bubbles: true,
				cancelable: true,
				button: 0,
			}),
		);
		await settle();
		expect(revealOpen()).toBe(true);
		expect(confirmationOpen()).toBe(false);
	});

	for (const close of ["Done", "Close", "Escape"]) {
		test(`successful clipboard copying releases the ${close} guard`, async () => {
			const copied: string[] = [];
			clipboard(async (value) => {
				copied.push(value);
			});
			await render(<RevealFixture />);
			await click("Copy api key");
			expect(copied).toEqual([fixtureKey.key]);
			expect(successes).toEqual(["API key copied."]);
			if (close === "Escape") await pressEscape();
			else await click(close);
			expect(revealOpen()).toBe(false);
			expect(confirmationOpen()).toBe(false);
			expect(document.activeElement?.textContent).toBe("New API key");
		});
	}

	for (const failure of ["rejected", "unavailable"]) {
		test(`${failure} clipboard copying keeps the reveal guard active`, async () => {
			clipboard(
				failure === "rejected"
					? async () => {
							throw new Error("Fixture clipboard failure");
						}
					: null,
			);
			await render(<RevealFixture />);
			await click("Copy api key");
			expect(successes).toHaveLength(0);
			expect(failures).toEqual([
				"Could not copy the api key. Select it instead.",
			]);
			await click("Done");
			expect(revealOpen()).toBe(true);
			expect(confirmationOpen()).toBe(true);
		});
	}

	test("the guard remains active until the clipboard promise succeeds", async () => {
		let resolveCopy: (() => void) | undefined;
		clipboard(
			() =>
				new Promise<void>((resolve) => {
					resolveCopy = resolve;
				}),
		);
		await render(<RevealFixture />);
		await click("Copy api key");
		await click("Done");
		expect(confirmationOpen()).toBe(true);
		await click("Go back to the key");
		resolveCopy?.();
		await settle();
		await click("Done");
		expect(revealOpen()).toBe(false);
	});

	test("a newly revealed key requires its own successful copy", async () => {
		clipboard(async () => undefined);
		const root = await render(
			<CreatedApiKeyDialog
				apiKey={fixtureKey}
				onOpenChange={() => undefined}
			/>,
		);
		await click("Copy api key");
		root.render(
			<StrictMode>
				<CreatedApiKeyDialog
					apiKey={{
						...fixtureKey,
						id: "fixture-key-2",
						key: "second-fixture-only-key",
					}}
					onOpenChange={() => undefined}
				/>
			</StrictMode>,
		);
		await settle();
		await click("Done");
		expect(confirmationOpen()).toBe(true);
	});

	test("existing copy consumers work without a callback; callbacks run only after successful copying", async () => {
		const copied: string[] = [];
		clipboard(async (value) => {
			copied.push(value);
		});
		await render(
			<>
				<CopyValue value="first fixture" label="First" />
				<CopyValue
					value="second fixture"
					label="Second"
					onCopied={() => copied.push("callback")}
				/>
			</>,
		);
		await click("Copy first");
		await click("Copy second");
		expect(copied).toEqual(["first fixture", "second fixture", "callback"]);
		expect(successes).toEqual(["First copied.", "Second copied."]);
	});

	async function renderSso(canConfigure = true) {
		permission.canConfigure = canConfigure;
		await render(
			<NuqsTestingAdapter searchParams="?new=true" hasMemory>
				<AddSsoProviderSheet />
			</NuqsTestingAdapter>,
		);
		expect(
			document.querySelector('[data-slot="sheet-content"][data-state="open"]'),
		).not.toBeNull();
	}

	function input(label: string) {
		const fieldLabel = [
			...document.querySelectorAll<HTMLLabelElement>("label"),
		].find((item) => item.textContent === label);
		const field = fieldLabel?.htmlFor
			? document.getElementById(fieldLabel.htmlFor)
			: null;
		if (!(field instanceof HTMLInputElement))
			throw new Error(`Missing input: ${label}`);
		return field;
	}

	async function fill(label: string, value: string) {
		const field = input(label);
		const setter = Object.getOwnPropertyDescriptor(
			browser.HTMLInputElement.prototype,
			"value",
		)?.set;
		setter?.call(field, value);
		field.dispatchEvent(new browser.Event("input", { bubbles: true }));
		field.dispatchEvent(new browser.Event("change", { bubbles: true }));
		await settle();
	}

	for (const copied of [false, true]) {
		test(`actual API-key creation returns focus to its trigger after ${copied ? "copied" : "confirmed uncopied"} close`, async () => {
			clipboard(async () => undefined);
			await render(
				<NuqsTestingAdapter hasMemory>
					<CreateApiKeySheet />
				</NuqsTestingAdapter>,
			);
			await click("New API key");
			await fill("Name", "Fixture key");
			await click("Create key");
			expect(revealOpen()).toBe(true);
			if (copied) await click("Copy api key");
			await click("Done");
			if (!copied) await click("Close anyway");
			expect(revealOpen()).toBe(false);
			expect(document.activeElement?.textContent).toBe("New API key");
		});
	}

	test("actual SSO form enables invalid submission, shows adjacent errors, focuses Name, and sends no registration", async () => {
		await renderSso();
		expect(button("Add provider").disabled).toBe(false);
		await click("Add provider");
		expect(submitted).toHaveLength(0);
		expect(document.querySelectorAll('[data-slot="field-error"]')).toHaveLength(
			5,
		);
		expect(document.activeElement).toBe(input("Name"));
		for (const label of [
			"Name",
			"Issuer URL",
			"Email domain",
			"Client ID",
			"Client secret",
		]) {
			const field = input(label);
			expect(field.getAttribute("aria-invalid")).toBe("true");
			expect(
				document.getElementById(field.getAttribute("aria-describedby") ?? "")
					?.textContent,
			).not.toBe("");
		}
	});

	test("actual SSO form blocks invalid URL and whitespace; valid fixture values reach only the mocked mutation", async () => {
		await renderSso();
		await fill("Name", " Fixture-Provider ");
		await fill("Issuer URL", "invalid-url");
		await fill("Email domain", " example.test ");
		await fill("Client ID", " fixture-client ");
		await fill("Client secret", "fixture-secret");
		await click("Add provider");
		expect(submitted).toHaveLength(0);
		expect(document.activeElement).toBe(input("Issuer URL"));
		await fill("Issuer URL", "https://issuer.example.test");
		await fill("Client secret", "   ");
		await click("Add provider");
		expect(submitted).toHaveLength(0);
		expect(document.activeElement).toBe(input("Client secret"));
		await fill("Client secret", " fixture-secret ");
		await click("Add provider");
		expect(submitted).toEqual([
			{
				providerId: "fixture-provider",
				issuer: "https://issuer.example.test",
				domain: "example.test",
				clientId: "fixture-client",
				clientSecret: "fixture-secret",
			},
		]);
	});

	test("actual SSO permission gate blocks both the button and direct form submission", async () => {
		await renderSso(false);
		expect(button("Add provider").disabled).toBe(true);
		await fill("Name", "fixture-provider");
		await fill("Issuer URL", "https://issuer.example.test");
		await fill("Email domain", "example.test");
		await fill("Client ID", "fixture-client");
		await fill("Client secret", "fixture-secret");
		document
			.querySelector("form")
			?.dispatchEvent(
				new browser.Event("submit", { bubbles: true, cancelable: true }),
			);
		await settle();
		expect(submitted).toHaveLength(0);
	});
	async function chooseRateCurrency() {
		const form = document.getElementById("manual-rate");
		const trigger = form?.querySelector<HTMLButtonElement>('[role="combobox"]');
		if (!trigger) throw new Error("Missing currency picker");
		trigger.click();
		await settle();
		const option = [
			...document.querySelectorAll<HTMLElement>('[role="option"]'),
		].find((item) => item.textContent?.startsWith("EUR"));
		if (!option) throw new Error("Missing EUR option");
		option.click();
		await settle();
	}

	test("actual manual-rate form enables empty submit and shows adjacent currency and rate errors", async () => {
		await render(<CurrencySettings />);
		expect(button("Save rate").disabled).toBe(false);
		await click("Save rate");
		expect(manualRates).toHaveLength(0);
		expect(document.querySelectorAll('[data-slot="field-error"]')).toHaveLength(
			2,
		);
		expect(document.activeElement).toBe(
			document.querySelector('#manual-rate [role="combobox"]'),
		);
	});

	test("actual manual-rate form blocks nonpositive and nonfinite rates; valid input reaches only the mock", async () => {
		await render(<CurrencySettings />);
		await chooseRateCurrency();
		for (const value of ["", "   ", "bad-rate", "0", "-1", "Infinity"]) {
			await fill("1 EUR = ? USD", value);
			await click("Save rate");
			expect(manualRates).toHaveLength(0);
			expect(input("1 EUR = ? USD").getAttribute("aria-invalid")).toBe("true");
			expect(document.activeElement).toBe(input("1 EUR = ? USD"));
		}
		await fill("1 EUR = ? USD", "1.09");
		await click("Save rate");
		expect(manualRates).toEqual([{ currency: "EUR", rate: 1.09 }]);
		expect(input("1 unit = ? USD").value).toBe("");
		expect(document.querySelectorAll('[data-slot="field-error"]')).toHaveLength(
			0,
		);
	});

	for (const denied of ["permission", "pending"]) {
		test(`actual manual-rate ${denied} restriction blocks direct submission`, async () => {
			permission.canManage = denied !== "permission";
			permission.pending = denied === "pending";
			await render(<CurrencySettings />);
			expect(button("Save rate").disabled).toBe(true);
			document
				.getElementById("manual-rate")
				?.dispatchEvent(
					new browser.Event("submit", { bubbles: true, cancelable: true }),
				);
			await settle();
			expect(manualRates).toHaveLength(0);
		});
	}
}
