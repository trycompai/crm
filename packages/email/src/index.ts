export {
	BLOCK_SHAPES,
	type Block,
	type DocumentProblem,
	documentProblems,
	EMAIL_DOCUMENT_LIMITS,
	EMPTY_DOCUMENT,
	type EmailDocument,
	emailDocument,
	type Inline,
	parseDocument,
	plainTextOf,
	readDocument,
	walkBlocks,
} from "./document";
export {
	type LintFinding,
	type LintInput,
	type LintLevel,
	lintEmail,
	lintErrors,
	summarize,
	textLength,
} from "./lint";
export {
	isKnownTag,
	MERGE_TAGS,
	type MergeContext,
	type MergeTag,
	NULLABLE_TAGS,
	resolveMerge,
	tagsIn,
} from "./merge";
export {
	type RenderInput,
	renderEmail,
	renderPlainText,
	type Shell,
} from "./render";
export {
	contrast,
	darkenUntilReadable,
	EMAIL_THEME,
	EMAIL_WIDTH,
	luminance,
} from "./theme";
