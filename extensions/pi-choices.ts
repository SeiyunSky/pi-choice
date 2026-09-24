import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { ask, CHOICES_BRIDGE_KEY, type Answers, type ChoicesOptions, type Question } from "../lib/choices.ts";

export default function piChoices(pi: ExtensionAPI) {
	// Publish bridge so other extensions can use pi-choices without import coupling
	(globalThis as Record<symbol, unknown>)[CHOICES_BRIDGE_KEY] = { ask };

	pi.registerTool({
		name: "pi_choices",
		description:
			"Present one or more structured questions to the user and collect answers. " +
			"Before making any engineering decision the user hasn't specified, use this tool to clarify requirements and align with them.",
		parameters: Type.Object({
			questions: Type.Array(
				Type.Object({
					type: Type.Union([
						Type.Literal("radio"),
						Type.Literal("checkbox"),
						Type.Literal("input"),
					], { description: "Question type: radio = single choice, checkbox = multiple choice, input = free text." }),
					id: Type.String({ description: "Unique identifier for this question. Used as the key in the returned answers object." }),
					question: Type.String({ description: "The question text shown to the user." }),
					options: Type.Optional(Type.Array(Type.String(), { description: "List of options (required for radio and checkbox)." })),
					allowOther: Type.Optional(Type.Boolean({ description: "Append a free-text 'Other…' option (radio or checkbox only). Default false." })),
					placeholder: Type.Optional(Type.String({ description: "Placeholder hint text shown in the input field (input type only)." })),
				}),
				{ description: "Questions to ask the user in order, one at a time." },
			),
			title: Type.Optional(Type.String({ description: "Optional title shown at the top of the form." })),
		}),
		async execute(_toolCallId, input, _signal, _onUpdate, ctx) {
			if (ctx.mode !== "tui" || !ctx.hasUI) {
				return { content: [{ type: "text" as const, text: "pi_choices requires an interactive TUI session." }] };
			}

			const questions = input.questions as Question[];
			const options: ChoicesOptions = { title: input.title as string | undefined };

			const answers: Answers | undefined = await ask(ctx, questions, options);

			if (answers === undefined) {
				return { content: [{ type: "text" as const, text: "User cancelled the choices form." }] };
			}

			return { content: [{ type: "text" as const, text: JSON.stringify(answers, null, 2) }] };
		},
	});
}
