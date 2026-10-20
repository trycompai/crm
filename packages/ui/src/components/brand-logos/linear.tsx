import type { SVGProps } from "react";

export default function LinearLogo(props: SVGProps<SVGSVGElement>) {
	return (
		<svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
			<path
				fill="currentColor"
				d="M3.3 15.6a10 10 0 0 0 5.1 5.1L3.3 15.6Zm-.9-4.9 10.9 10.9a10 10 0 0 0 3.1-.9L3.3 7.6a10 10 0 0 0-.9 3.1Zm1.9-6.1 15.1 15.1a10 10 0 0 0 1.8-2.2L6.5 2.8a10 10 0 0 0-2.2 1.8ZM12 2c-1 0-2 .2-2.9.4l12.5 12.5c.3-.9.4-1.9.4-2.9A10 10 0 0 0 12 2Z"
			/>
		</svg>
	);
}
