import { expect, test } from "bun:test";
import { TokenField } from "@crm/ui/components/token-field";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

test("hides an empty placeholder while the field contains focus", () => {
	const markup = renderToStaticMarkup(
		createElement(TokenField, {
			"data-empty": true,
			"data-placeholder": "Send a message",
		}),
	);

	expect(markup).toContain("focus-within:before:hidden");
});
