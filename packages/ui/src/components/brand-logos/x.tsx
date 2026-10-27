import type * as React from "react";

const XLogo = (props: React.SVGProps<SVGSVGElement>) => (
	<svg
		viewBox="0 0 16 16"
		xmlns="http://www.w3.org/2000/svg"
		aria-hidden="true"
		{...props}
	>
		<path
			d="M9.49 6.775 15.318 0h-1.381L8.877 5.883 4.834 0H.172l6.112 8.895L.172 16h1.381l5.344-6.212L11.166 16h4.662L9.49 6.775Zm-1.891 2.2-.619-.886L2.05 1.04h2.121l3.977 5.688.619.886 5.17 7.393h-2.121L7.599 8.975Z"
			fill="currentColor"
		/>
	</svg>
);

export default XLogo;
