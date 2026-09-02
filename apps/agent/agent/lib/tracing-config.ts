export const TRACING = {
	inference: {
		keyVar: "INFERENCE_API_KEY",
		endpointVar: "INFERENCE_OTLP_ENDPOINT",
		serviceNameVar: "INFERENCE_SERVICE_NAME",
		defaultEndpoint: "https://telemetry.inference.net",
		defaultServiceName: "crm-agent",
	},

	attributes: {
		userId: "user.id",
		convoId: "session.id",
	},

	principals: {
		human: "user",
	},

	content: {
		recordVar: "INFERENCE_RECORD_CONTENT",
		recordByDefault: true,
	},
} as const;
