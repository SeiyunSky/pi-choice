import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { DynamicBorder } from "@earendil-works/pi-coding-agent";
import { Container, Input, SelectList, Spacer, Text, type SelectItem } from "@earendil-works/pi-tui";

export type RadioQuestion = {
	type: "radio";
	id: string;
	question: string;
	options: string[];
	allowOther?: boolean;
};

export type CheckboxQuestion = {
	type: "checkbox";
	id: string;
	question: string;
	options: string[];
	allowOther?: boolean;
};

export type InputQuestion = {
	type: "input";
	id: string;
	question: string;
	placeholder?: string;
};

export type Question = RadioQuestion | CheckboxQuestion | InputQuestion;
export type Answers = Record<string, string | string[]>;

export type ChoicesBridge = {
	ask(ctx: ExtensionContext, questions: Question[]): Promise<Answers | undefined>;
};

export const CHOICES_BRIDGE_KEY = Symbol.for("pi-choices.bridge.v1");

const OTHER_SENTINEL = "__other__";
const BACK = "__back__" as const;
type Back = typeof BACK;

function progress(current: number, total: number): string {
	return `Question ${current} / ${total}`;
}

function hint(type: Question["type"], index: number): string {
	const back = index > 0 ? "  |  ← back" : "";
	if (type === "radio") return `↑/↓ navigate  |  Enter select  |  Esc cancel${back}`;
	if (type === "checkbox") return `↑/↓ navigate  |  Enter toggle/confirm  |  Esc cancel${back}`;
	return `type answer  |  Enter confirm  |  Esc cancel${back}`;
}

function frame(container: Container, theme: { fg(name: string, text: string): string; bold(text: string): string }, question: string, index: number, total: number): void {
	container.addChild(new DynamicBorder((s) => theme.fg("accent", s)));
	if (total > 1) container.addChild(new Text(theme.fg("dim", progress(index + 1, total)), 1, 0));
	container.addChild(new Text(theme.fg("accent", theme.bold(question)), 1, 0));
	container.addChild(new Spacer(1));
}

async function askRadio(
	ctx: ExtensionContext,
	q: RadioQuestion,
	index: number,
	total: number,
	previous?: string,
): Promise<string | Back | undefined> {
	const rawOptions = q.allowOther ? [...q.options, "Other..."] : q.options;
	const items: SelectItem[] = rawOptions.map((option) => ({
		value: option === "Other..." ? OTHER_SENTINEL : option,
		label: option,
	}));

	return ctx.ui.custom<string | Back | undefined>((tui, theme, _kb, done) => {
		const container = new Container();
		frame(container, theme, q.question, index, total);
		const list = new SelectList(items, Math.min(items.length, 10), {
			selectedPrefix: (text) => theme.fg("accent", text),
			selectedText: (text) => theme.fg("accent", text),
			description: (text) => theme.fg("muted", text),
			scrollInfo: (text) => theme.fg("dim", text),
			noMatch: (text) => theme.fg("warning", text),
		});
		const previousIndex = items.findIndex((item) => item.value === previous);
		if (previousIndex >= 0) list.setSelectedIndex(previousIndex);
		else if (previous && q.allowOther) list.setSelectedIndex(items.length - 1);
		list.onSelect = (item) => done(item.value);
		list.onCancel = () => done(undefined);
		container.addChild(list);
		container.addChild(new Spacer(1));
		container.addChild(new Text(theme.fg("dim", hint("radio", index)), 1, 0));
		container.addChild(new DynamicBorder((s) => theme.fg("accent", s)));
		return {
			render: (width) => container.render(width),
			invalidate: () => container.invalidate(),
			handleInput: (data) => {
				if ((data === "\x1b[D" || data === "\x7f") && index > 0) { done(BACK); return; }
				list.handleInput(data);
				tui.requestRender();
			},
		};
	});
}

async function askCheckbox(
	ctx: ExtensionContext,
	q: CheckboxQuestion,
	index: number,
	total: number,
	previous: string[] = [],
): Promise<string[] | Back | undefined> {
	const options = q.allowOther ? [...q.options, "Other..."] : q.options;
	const ids = options.map((option) => option === "Other..." ? OTHER_SENTINEL : option);
	const selected = new Set(previous.filter((value) => ids.includes(value)));
	if (previous.some((value) => !ids.includes(value)) && q.allowOther) selected.add(OTHER_SENTINEL);
	let cursor = 0;

	return ctx.ui.custom<string[] | Back | undefined>((tui, theme, _kb, done) => {
		const container = new Container();
		frame(container, theme, q.question, index, total);
		const listText = new Text("", 1, 0);
		container.addChild(listText);
		container.addChild(new Spacer(1));
		container.addChild(new Text(theme.fg("dim", hint("checkbox", index)), 1, 0));
		container.addChild(new DynamicBorder((s) => theme.fg("accent", s)));

		const redraw = () => {
			const lines = options.map((option, optionIndex) => {
				const id = ids[optionIndex];
				const marker = selected.has(id) ? "☑" : "☐";
				const line = `${marker} ${option}`;
				return optionIndex === cursor ? theme.fg("accent", `› ${line}`) : `  ${line}`;
			});
			const confirmIndex = options.length;
			const confirm = "✓ Confirm selections";
			lines.push(cursor === confirmIndex ? theme.fg("success", `› ${confirm}`) : `  ${confirm}`);
			listText.setText(lines.join("\n"));
		};
		redraw();

		return {
			render: (width) => container.render(width),
			invalidate: () => container.invalidate(),
			handleInput: (data) => {
				if ((data === "\x1b[D" || data === "\x7f") && index > 0) { done(BACK); return; }
				if (data === "\x1b") { done(undefined); return; }
				if (data === "\x1b[A" || data === "k") cursor = (cursor + options.length) % (options.length + 1);
				else if (data === "\x1b[B" || data === "j") cursor = (cursor + 1) % (options.length + 1);
				else if (data === "\r" || data === "\n") {
					if (cursor === options.length) { done(Array.from(selected)); return; }
					const id = ids[cursor];
					if (selected.has(id)) selected.delete(id); else selected.add(id);
				}
				redraw();
				tui.requestRender();
			},
		};
	});
}

async function askInput(
	ctx: ExtensionContext,
	q: InputQuestion,
	index: number,
	total: number,
	previous = "",
): Promise<string | Back | undefined> {
	return ctx.ui.custom<string | Back | undefined>((tui, theme, _kb, done) => {
		const container = new Container();
		frame(container, theme, q.question, index, total);
		const input = new Input({ placeholder: q.placeholder ?? "" });
		input.setValue(previous);
		input.onSubmit = (value) => {
			const trimmed = value.trim();
			if (!trimmed) return;
			done(trimmed);
		};
		input.onEscape = () => done(undefined);
		container.addChild(input);
		container.addChild(new Spacer(1));
		container.addChild(new Text(theme.fg("dim", hint("input", index)), 1, 0));
		container.addChild(new DynamicBorder((s) => theme.fg("accent", s)));
		return {
			render: (width) => container.render(width),
			invalidate: () => container.invalidate(),
			handleInput: (data) => {
				if ((data === "\x1b[D" || data === "\x7f") && index > 0 && input.getValue().length === 0) { done(BACK); return; }
				input.handleInput(data);
				tui.requestRender();
			},
		};
	});
}

async function askOtherText(ctx: ExtensionContext, question: string, previous = ""): Promise<string | Back | undefined> {
	return ctx.ui.custom<string | Back | undefined>((tui, theme, _kb, done) => {
		const container = new Container();
		container.addChild(new DynamicBorder((s) => theme.fg("accent", s)));
		container.addChild(new Text(theme.fg("muted", `Other — ${question}`), 1, 0));
		container.addChild(new Spacer(1));
		const input = new Input({ placeholder: "Enter your answer..." });
		input.setValue(previous);
		input.onSubmit = (value) => {
			const trimmed = value.trim();
			if (!trimmed) { done(BACK); return; }
			done(trimmed);
		};
		input.onEscape = () => done(BACK);
		container.addChild(input);
		container.addChild(new Spacer(1));
		container.addChild(new Text(theme.fg("dim", "type answer  |  Enter confirm  |  empty Enter / Esc ← back"), 1, 0));
		container.addChild(new DynamicBorder((s) => theme.fg("accent", s)));
		return {
			render: (width) => container.render(width),
			invalidate: () => container.invalidate(),
			handleInput: (data) => { input.handleInput(data); tui.requestRender(); },
		};
	});
}

export async function ask(ctx: ExtensionContext, questions: Question[]): Promise<Answers | undefined> {
	const answers: Answers = {};
	for (let index = 0; index < questions.length;) {
		const question = questions[index];
		if (question.type === "radio") {
			let value = await askRadio(ctx, question, index, questions.length, answers[question.id] as string | undefined);
			if (value === undefined) return undefined;
			if (value === BACK) { index--; continue; }
			if (value === OTHER_SENTINEL) {
				const previous = typeof answers[question.id] === "string" && !question.options.includes(answers[question.id] as string) ? answers[question.id] as string : "";
				const other = await askOtherText(ctx, question.question, previous);
				if (other === undefined) return undefined;
				if (other === BACK) continue;
				value = other;
			}
			answers[question.id] = value;
		} else if (question.type === "checkbox") {
			let values = await askCheckbox(ctx, question, index, questions.length, (answers[question.id] as string[] | undefined) ?? []);
			if (values === undefined) return undefined;
			if (values === BACK) { index--; continue; }
			if (values.includes(OTHER_SENTINEL)) {
				const prior = (answers[question.id] as string[] | undefined)?.find((value) => !question.options.includes(value)) ?? "";
				const other = await askOtherText(ctx, question.question, prior);
				if (other === undefined) return undefined;
				if (other === BACK) continue;
				values = [...values.filter((value) => value !== OTHER_SENTINEL), other];
			}
			answers[question.id] = values;
		} else {
			const value = await askInput(ctx, question, index, questions.length, (answers[question.id] as string | undefined) ?? "");
			if (value === undefined) return undefined;
			if (value === BACK) { index--; continue; }
			answers[question.id] = value;
		}
		index++;
	}
	return answers;
}
