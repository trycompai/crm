import type * as React from "react";

const MicrosoftLogo = (props: React.SVGProps<SVGSVGElement>) => (
	<svg
		viewBox="0 0 23 23"
		xmlns="http://www.w3.org/2000/svg"
		preserveAspectRatio="xMidYMid"
		aria-hidden="true"
		{...props}
	>
		<path d="M0 0h11v11H0z" fill="#f25022" />
		<path d="M12 0h11v11H12z" fill="#7fba00" />
		<path d="M0 12h11v11H0z" fill="#00a4ef" />
		<path d="M12 12h11v11H12z" fill="#ffb900" />
	</svg>
);

export default MicrosoftLogo;
