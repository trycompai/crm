"use client";

import { useMutation } from "@tanstack/react-query";
import { useCallback } from "react";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";

function base64Of(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();

		reader.onerror = () => reject(new Error("That file could not be read."));
		reader.onload = () => {
			const result = String(reader.result);
			resolve(result.slice(result.indexOf(",") + 1));
		};

		reader.readAsDataURL(file);
	});
}

export function useImageUpload(): (file: File) => Promise<string | null> {
	const trpc = useTRPC();

	const upload = useMutation(
		trpc.marketingTemplates.uploadImage.mutationOptions(),
	);

	return useCallback(
		async (file: File) => {
			try {
				const result = await upload.mutateAsync({
					filename: file.name,
					mimeType: file.type,
					contentBase64: await base64Of(file),
				});

				toast.success("Uploaded.");
				return result.url;
			} catch (error) {
				toast.error(
					error instanceof Error ? error.message : "The upload failed.",
				);
				return null;
			}
		},
		[upload],
	);
}
