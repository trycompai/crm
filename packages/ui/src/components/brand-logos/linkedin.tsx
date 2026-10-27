import type * as React from "react";

const LinkedInLogo = (props: React.SVGProps<SVGSVGElement>) => (
	<svg
		viewBox="0 0 16 16"
		xmlns="http://www.w3.org/2000/svg"
		aria-hidden="true"
		{...props}
	>
		<path
			d="M14.816 0H1.18C.528 0 0 .516 0 1.153v13.69C0 15.48.528 16 1.18 16h13.635c.652 0 1.185-.52 1.185-1.156V1.153C16 .516 15.467 0 14.816 0ZM4.746 13.635H2.372V5.999h2.374v7.636ZM3.56 4.956a1.376 1.376 0 1 1 0-2.752 1.376 1.376 0 0 1 0 2.752Zm10.075 8.679H11.26V9.921c0-.886-.018-2.025-1.234-2.025-1.235 0-1.424.964-1.424 1.96v3.779H6.23V5.999h2.277v1.043h.031c.318-.602 1.092-1.234 2.247-1.234 2.403 0 2.85 1.582 2.85 3.638v4.189Z"
			fill="currentColor"
		/>
	</svg>
);

export default LinkedInLogo;
