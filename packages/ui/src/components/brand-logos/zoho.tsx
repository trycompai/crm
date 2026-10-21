import type * as React from "react";

/**
 * Zoho's mark, drawn as the four brand bars rather than the wordmark so it
 * reads at 16px next to the other connection logos.
 */
const ZohoLogo = (props: React.SVGProps<SVGSVGElement>) => (
	<svg
		viewBox="0 0 24 24"
		xmlns="http://www.w3.org/2000/svg"
		preserveAspectRatio="xMidYMid"
		aria-hidden="true"
		{...props}
	>
		<rect x="1" y="6" width="4.5" height="12" rx="1" fill="#e42527" />
		<rect x="6.9" y="4" width="4.5" height="16" rx="1" fill="#f9b21d" />
		<rect x="12.8" y="6" width="4.5" height="12" rx="1" fill="#089949" />
		<rect x="18.7" y="8.5" width="4.3" height="7" rx="1" fill="#226db4" />
	</svg>
);

export default ZohoLogo;
