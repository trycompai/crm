import { cn } from "@crm/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";

const SILHOUETTE =
	"M384 99.548 367.934 87.04 256.021 0 0 199.096v113.782L256.021 512 512 312.879V199.096Z";

const MARK =
	"m384 99.548 -16.066 -12.508L256.021 0 0 199.096v113.782L256.021 512 512 312.879V199.096zm-127.98 -49.419 79.695 61.975 -40.944 31.803 -3.661 2.837 -35.091 -27.287 -102.399 79.638 35.09 27.287 32.218 25.088 35.09 27.288L358.4 199.074l-35.047 -27.288 3.659 -2.837 40.943 -31.803 79.651 61.952 -40.943 31.852 -150.62 117.163 -79.695 -61.974 -32.218 -25.041 -38.752 -30.125 -40.922 -31.849z";

const logoSpinnerVariants = cva("shrink-0", {
	variants: {
		size: {
			default: "size-4",
			lg: "size-10",
		},
	},
	defaultVariants: {
		size: "default",
	},
});

function LogoSpinner({
	className,
	size,
	...props
}: React.ComponentProps<"svg"> & VariantProps<typeof logoSpinnerVariants>) {
	return (
		<svg
			data-slot="logo-spinner"
			role="status"
			aria-label="Loading"
			xmlns="http://www.w3.org/2000/svg"
			viewBox="-68 -68 648 648"
			fill="none"
			className={cn(logoSpinnerVariants({ size }), className)}
			{...props}
		>
			<path d={MARK} fill="currentColor" fillOpacity={0.85} />
			<path
				d={SILHOUETTE}
				transform="translate(256 256) scale(1.16) translate(-256 -256)"
				stroke="var(--ring)"
				strokeWidth={32}
				strokeLinejoin="round"
				strokeLinecap="round"
				pathLength={100}
				strokeDasharray="40 60"
				className="animate-spinner-trace"
			/>
		</svg>
	);
}

export { LogoSpinner };
