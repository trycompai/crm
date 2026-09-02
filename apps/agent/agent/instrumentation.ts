import "@crm/env/load";

import { defineCatalystEveInstrumentation } from "@inference/tracing/eve";
import { trace } from "@opentelemetry/api";
import {
	environmentOf,
	principalOf,
	recordsTraceContent,
	resolveTraceDestination,
} from "./lib/tracing";
import { TRACING } from "./lib/tracing-config";

const destination = resolveTraceDestination(process.env);
const exporter = destination.kind === "inference" ? destination : null;
const recordsContent = recordsTraceContent(process.env);

if (destination.kind === "off") {
	console.log(
		`[agent] tracing off (${destination.label}). eve's local trace store is not written while this file exists, so nothing is recorded. Set ${TRACING.inference.keyVar} to send traces to Inference.`,
	);
} else {
	console.log(
		`[agent] tracing on: ${destination.label} as ${destination.serviceName}. Model inputs and outputs are ${recordsContent ? "included" : `withheld (${TRACING.content.recordVar})`}.`,
	);
}

export default defineCatalystEveInstrumentation({
	token: exporter?.token,
	endpoint: exporter?.endpoint,
	serviceName: exporter?.serviceName,
	functionId: exporter?.serviceName,

	recordInputs: recordsContent,
	recordOutputs: recordsContent,

	environment: environmentOf(process.env),

	events: {
		"step.started"(input) {
			const userId = principalOf(input.session);
			const span = trace.getActiveSpan();

			span?.setAttribute(TRACING.attributes.convoId, input.session.id);
			if (userId) span?.setAttribute(TRACING.attributes.userId, userId);

			const convo = { [TRACING.attributes.convoId]: input.session.id };

			return {
				runtimeContext: userId
					? { ...convo, [TRACING.attributes.userId]: userId }
					: convo,
			};
		},
	},
});
