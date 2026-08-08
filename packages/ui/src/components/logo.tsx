import type * as React from "react";

const Logo = (props: React.SVGProps<SVGSVGElement>) => (
	<svg
		xmlns="http://www.w3.org/2000/svg"
		width={512}
		height={512}
		viewBox="0 0 512 512"
		fill="none"
		aria-label="Comp AI Logo"
		{...props}
	>
		<path
			d="m384 99.548 -16.066 -12.508L256.021 0 0 199.096v113.782L256.021 512 512 312.879V199.096zm-127.98 -49.419 79.695 61.975 -40.944 31.803 -3.661 2.837 -35.091 -27.287 -102.399 79.638 35.09 27.287 32.218 25.088 35.09 27.288L358.4 199.074l-35.047 -27.288 3.659 -2.837 40.943 -31.803 79.651 61.952 -40.943 31.852 -150.62 117.163 -79.695 -61.974 -32.218 -25.041 -38.752 -30.125 -40.922 -31.849z"
			fill="currentColor"
		/>
	</svg>
);
export default Logo;
