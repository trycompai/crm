import { afterEach, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { StrictMode, useState } from "react";

if (process.env.CRM_PAGINATION_TEST_CHILD !== "1") {
	test("pagination focus passes in an isolated DOM", () => {
		const result = Bun.spawnSync(["bun", "test", import.meta.path], {
			env: { ...process.env, CRM_PAGINATION_TEST_CHILD: "1" },
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
	});
	const { createRoot } = await import("react-dom/client");
	const { flushSync } = await import("react-dom");
	const { TablePagination } = await import(
		"../src/components/table-pagination"
	);
	const roots: Array<ReturnType<typeof createRoot>> = [];

	afterEach(() => {
		flushSync(() => {
			for (const root of roots.splice(0)) root.unmount();
		});
		document.body.innerHTML = "";
	});

	function Fixture({
		initialPage,
		pages,
	}: {
		initialPage: number;
		pages: number;
	}) {
		const [page, setPage] = useState(initialPage);
		return (
			<TablePagination
				page={page}
				totalPages={pages}
				pageSize={25}
				total={pages * 25}
				onPageChange={setPage}
			/>
		);
	}

	function render(initialPage: number, pages: number) {
		const container = document.createElement("div");
		document.body.append(container);
		const root = createRoot(container);
		roots.push(root);
		flushSync(() => {
			root.render(
				<StrictMode>
					<Fixture initialPage={initialPage} pages={pages} />
				</StrictMode>,
			);
		});
		const [previous, next] = container.querySelectorAll("button");
		if (!previous || !next) throw new Error("Paging controls are missing.");
		return { previous, next };
	}

	test("reaching the final page moves focus from disabled Next to Previous", () => {
		const { previous, next } = render(1, 2);
		next.focus();
		flushSync(() => next.click());
		expect(next.disabled).toBe(true);
		expect(previous.disabled).toBe(false);
		expect(document.activeElement).toBe(previous);
	});

	test("reaching the first page moves focus from disabled Previous to Next", () => {
		const { previous, next } = render(2, 2);
		previous.focus();
		flushSync(() => previous.click());
		expect(previous.disabled).toBe(true);
		expect(next.disabled).toBe(false);
		expect(document.activeElement).toBe(next);
	});

	test("intermediate pages keep focus on the active paging control", () => {
		const { next } = render(1, 3);
		next.focus();
		flushSync(() => next.click());
		expect(next.disabled).toBe(false);
		expect(document.activeElement).toBe(next);
	});

	test("programmatic page changes preserve focus outside pagination", () => {
		const { next } = render(1, 2);
		const input = document.createElement("input");
		document.body.append(input);
		input.focus();
		flushSync(() => next.click());
		expect(next.disabled).toBe(true);
		expect(document.activeElement).toBe(input);
	});

	test("delayed page changes preserve a newer focus choice", () => {
		const container = document.createElement("div");
		document.body.append(container);
		const root = createRoot(container);
		roots.push(root);
		let requested = 1;
		const renderPage = (page: number) =>
			flushSync(() => {
				root.render(
					<TablePagination
						page={page}
						totalPages={2}
						pageSize={25}
						total={45}
						onPageChange={(next) => {
							requested = next;
						}}
					/>,
				);
			});
		renderPage(1);
		const next = container.querySelectorAll("button")[1];
		if (!next) throw new Error("Next is missing.");
		next.focus();
		next.click();
		const input = document.createElement("input");
		document.body.append(input);
		input.focus();
		renderPage(requested);
		expect(next.disabled).toBe(true);
		expect(document.activeElement).toBe(input);
	});
}
