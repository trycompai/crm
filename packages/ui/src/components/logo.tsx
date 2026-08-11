import type * as React from "react";

const Logo = (props: React.SVGProps<SVGSVGElement>) => (
	<svg
		xmlns="http://www.w3.org/2000/svg"
		width={64}
		height={64}
		viewBox="0 0 64 64"
		fill="none"
		aria-label="Lode Logo"
		{...props}
	>
		<rect width="64" height="64" rx="14" fill="#F56B1C" />
		<path
			d="M17 45V17h8v21h14v7H17Z"
			fill="#161412"
		/>
		<path d="M36 45V17h8v21h7v7H36Z" fill="#161412" opacity=".88" />
	</svg>
);
export default Logo;
