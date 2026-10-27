import { afterEach, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { type ReactNode, StrictMode, useState } from "react";

if (process.env.CRM_FORM_SHEET_TEST_CHILD !== "1") {
	test("form sheet behaviors pass in an isolated DOM", () => {
		const result = Bun.spawnSync(["bun", "test", import.meta.path], {
			env: { ...process.env, CRM_FORM_SHEET_TEST_CHILD: "1" },
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
		HTMLElement: browser.HTMLElement,
		HTMLInputElement: browser.HTMLInputElement,
		HTMLSelectElement: browser.HTMLSelectElement,
		HTMLTextAreaElement: browser.HTMLTextAreaElement,
		Node: browser.Node,
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

	const { createRoot } = await import("react-dom/client");
	const {
		FormSheet,
		FormSheetContent,
		FormSheetFooter,
		FormSheetForm,
		FormSheetHeader,
		useFormSheetValidation,
	} = await import("../src/components/form-sheet");
	const { SheetTrigger } = await import("../src/components/sheet");
	const { Field, FieldError, FieldLabel } = await import(
		"../src/components/field"
	);
	const { Input } = await import("../src/components/input");
	const roots: Array<ReturnType<typeof createRoot>> = [];

	afterEach(async () => {
		for (const root of roots.splice(0)) root.unmount();
		await settle();
		document.body.innerHTML = "";
	});

	function Fixture({ pending = false }: { pending?: boolean }) {
		const [open, setOpen] = useState(false);
		const [value, setValue] = useState("");
		return (
			<FormSheet
				open={open}
				onOpenChange={setOpen}
				dirty={value !== ""}
				pending={pending}
				onDiscard={() => setValue("")}
			>
				<SheetTrigger>New item</SheetTrigger>
				<FormSheetContent>
					<FormSheetHeader title="Create item" description="Add an item." />
					<FormSheetForm id="create-item">
						<Input
							aria-label="Name"
							value={value}
							onChange={(event) => setValue(event.target.value)}
						/>
						<button type="button" onClick={() => setValue("Draft")}>
							Fill draft
						</button>
						<button type="button" onClick={() => setValue("")}>
							Clear draft
						</button>
					</FormSheetForm>
					<FormSheetFooter>
						<button type="submit" form="create-item">
							Save
						</button>
					</FormSheetFooter>
				</FormSheetContent>
			</FormSheet>
		);
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

	async function settle() {
		await new Promise((resolve) => setTimeout(resolve, 25));
	}

	async function click(label: string) {
		const button = [
			...document.querySelectorAll<HTMLButtonElement>("button"),
		].find((item) => item.textContent === label);
		expect(button).toBeDefined();
		button?.click();
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

	function sheetOpen() {
		return (
			document.querySelector(
				'[data-slot="sheet-content"][data-state="open"]',
			) !== null
		);
	}

	function questionOpen() {
		return (
			document.querySelector('[role="alertdialog"][data-state="open"]') !== null
		);
	}

	test("Escape closes a clean form and returns focus to its trigger", async () => {
		await render(<Fixture />);
		await click("New item");
		expect(sheetOpen()).toBe(true);
		await pressEscape();
		expect(sheetOpen()).toBe(false);
		expect(document.activeElement?.textContent).toBe("New item");
	});

	test("dirty close asks; Keep editing and confirmation Escape retain the draft", async () => {
		await render(<Fixture />);
		await click("New item");
		await click("Fill draft");
		await click("Close");
		expect(questionOpen()).toBe(true);
		expect(document.activeElement?.textContent).toBe("Keep editing");
		await click("Keep editing");
		expect(
			document.activeElement?.closest("[data-slot=sheet-content]"),
		).not.toBeNull();
		expect(sheetOpen()).toBe(true);
		expect(
			document.querySelector<HTMLInputElement>('input[aria-label="Name"]')
				?.value,
		).toBe("Draft");
		await pressEscape();
		expect(questionOpen()).toBe(true);
		await pressEscape();
		expect(questionOpen()).toBe(false);
		expect(sheetOpen()).toBe(true);
		expect(
			document.querySelector<HTMLInputElement>('input[aria-label="Name"]')
				?.value,
		).toBe("Draft");
	});

	test("confirmed discard clears the draft before reopening", async () => {
		await render(<Fixture />);
		await click("New item");
		await click("Fill draft");
		await pressEscape();
		await click("Discard");
		expect(sheetOpen()).toBe(false);
		await click("New item");
		expect(
			document.querySelector<HTMLInputElement>('input[aria-label="Name"]')
				?.value,
		).toBe("");
	});

	test("Cancel clears a dirty draft without asking", async () => {
		await render(<Fixture />);
		await click("New item");
		await click("Fill draft");
		await click("Cancel");
		expect(sheetOpen()).toBe(false);
		expect(questionOpen()).toBe(false);
		await click("New item");
		expect(
			document.querySelector<HTMLInputElement>('input[aria-label="Name"]')
				?.value,
		).toBe("");
	});

	test("reverting the actual value removes the discard prompt", async () => {
		await render(<Fixture />);
		await click("New item");
		await click("Fill draft");
		await click("Clear draft");
		await pressEscape();
		expect(sheetOpen()).toBe(false);
		expect(questionOpen()).toBe(false);
	});

	test("pending forms block Close, Escape, Cancel, and duplicate submission", async () => {
		let submitted = 0;
		await render(
			<FormSheet
				defaultOpen
				pending
				dirty
				onDiscard={() => {
					throw new Error("Unexpected discard");
				}}
			>
				<FormSheetContent>
					<FormSheetHeader title="Pending form" description="Saving item." />
					<FormSheetForm
						id="pending"
						onSubmit={(event) => {
							event.preventDefault();
							submitted += 1;
						}}
					>
						<Input aria-label="Name" defaultValue="Draft" />
					</FormSheetForm>
					<FormSheetFooter>
						<button type="submit" form="pending">
							Save
						</button>
					</FormSheetFooter>
				</FormSheetContent>
			</FormSheet>,
		);
		await click("Close");
		await pressEscape();
		await click("Cancel");
		await click("Save");
		expect(sheetOpen()).toBe(true);
		expect(questionOpen()).toBe(false);
		expect(submitted).toBe(0);
	});

	test("outside pointer presses never close a clean or dirty form", async () => {
		await render(<Fixture />);
		await click("New item");
		for (const dirty of [false, true]) {
			if (dirty) await click("Fill draft");
			document.body.dispatchEvent(
				new browser.PointerEvent("pointerdown", {
					bubbles: true,
					cancelable: true,
					button: 0,
				}),
			);
			await settle();
			expect(sheetOpen()).toBe(true);
			expect(questionOpen()).toBe(false);
		}
	});

	function ValidationFixture({ onSubmit }: { onSubmit: () => void }) {
		const validation = useFormSheetValidation();
		return (
			<FormSheetForm
				noValidate
				onInput={validation.onInput}
				onSubmit={(event) => {
					event.preventDefault();
					if (validation.validate(event.currentTarget)) onSubmit();
				}}
			>
				<Field data-invalid={!!validation.errors.name}>
					<FieldLabel htmlFor="name">Name</FieldLabel>
					<Input
						id="name"
						required
						pattern=".*\S.*"
						aria-invalid={!!validation.errors.name}
						aria-describedby={validation.errors.name ? "name-error" : undefined}
					/>
					<FieldError id="name-error">{validation.errors.name}</FieldError>
				</Field>
				<Field>
					<FieldLabel htmlFor="email">Email</FieldLabel>
					<Input id="email" type="email" />
					<FieldError>{validation.errors.email}</FieldError>
				</Field>
				<button type="submit">Save</button>
			</FormSheetForm>
		);
	}

	test("invalid submission shows native constraint errors, focuses the first field, and never calls submit", async () => {
		let submitted = 0;
		await render(
			<ValidationFixture
				onSubmit={() => {
					submitted += 1;
				}}
			/>,
		);
		await click("Save");
		expect(submitted).toBe(0);
		expect(document.activeElement?.id).toBe("name");
		expect(document.querySelector('[id="name-error"]')?.textContent).not.toBe(
			"",
		);
		expect(
			document.querySelector('[id="name"]')?.getAttribute("aria-invalid"),
		).toBe("true");
		const name = document.querySelector<HTMLInputElement>('[id="name"]');
		const email = document.querySelector<HTMLInputElement>('[id="email"]');
		if (!name || !email) throw new Error("Missing fields");
		name.value = "   ";
		await click("Save");
		expect(submitted).toBe(0);
		name.value = "New item";
		email.value = "invalid";
		await click("Save");
		expect(submitted).toBe(0);
		expect(document.activeElement?.id).toBe("email");
		email.value = "person@example.com";
		await click("Save");
		expect(submitted).toBe(1);
	});
}
