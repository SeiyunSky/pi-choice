import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { DynamicBorder, getSettingsListTheme } from "@earendil-works/pi-coding-agent";
import { Container, Input, SelectList, SettingsList, Spacer, Text, type SelectItem, type SettingItem } from "@earendil-works/pi-tui";

// --- Public types ------------------------------------------------------------

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

export type ChoicesOptions = {
	batch?: boolean;
	title?: string;
};

// --- Bridge ------------------------------------------------------------------

export type ChoicesBridge = {
	ask(ctx: ExtensionContext, questions: Question[], options?: ChoicesOptions): Promise<Answers | undefined>;
};

export const CHOICES_BRIDGE_KEY = Symbol.for("pi-choices.bridge.v1");

// --- Internal helpers --------------------------------------------------------

const OTHER_SENTINEL = "__other__";
const BACK = "__back__" as const;
type Back = typeof BACK;

function progress(current: number, total: number): string {
	return `Question ${current} / ${total}`;
}

function hint(type: Question["type"], index: number): string {
	const back = index > 0 ? "  |  <- back" : "";
	if (type === "radio")    return `up/down  |  enter select  |  esc cancel${back}`;
	if (type === "checkbox") return `up/down  |  space toggle  |  enter confirm  |  esc cancel${back}`;
	return `type answer  |  enter confirm  |  esc cancel${back}`;
}

// --- Radio -------------------------------------------------------------------

async function askRadio(
	ctx: ExtensionContext,
	q: RadioQuestion,
	index: number,
	total: number,
): Promise<string | Back | undefined> {
	const rawOptions = q.allowOther ? [...q.options, "Other..."] : q.options;
	const items: SelectItem[] = rawOptions.map((o) => ({
		value: o === "Other..." ? OTHER_SENTINEL : o,
		label: o,
	}));

	return ctx.ui.custom<string | Back | undefined>((tui, theme, _kb, done) => {
		const container = new Container();
		container.addChild(new DynamicBorder((s) => theme.fg("accent", s)));
		if (total > 1) container.addChild(new Text(theme.fg("dim", progress(index + 1, total)), 1, 0));
		container.addChild(new Text(theme.fg("accent", theme.bold(q.question)), 1, 0));
		container.addChild(new Spacer(1));

		const list = new SelectList(items, Math.min(items.length, 10), {
			selectedPrefix: (t) => theme.fg("accent", t),
			selectedText:   (t) => theme.fg("accent", t),
			description:    (t) => theme.fg("muted", t),
			scrollInfo:     (t) => theme.fg("dim", t),
			noMatch:        (t) => theme.fg("warning", t),
		});
		list.onSelect = (item) => done(item.value);
		list.onCancel = () => done(undefined);
		container.addChild(list);
		container.addChild(new Spacer(1));
		container.addChild(new Text(theme.fg("dim", hint("radio", index)), 1, 0));
		container.addChild(new DynamicBorder((s) => theme.fg("accent", s)));

		return {
			render:      (w) => container.render(w),
			invalidate:  ()  => container.invalidate(),
			handleInput: (data) => {
				if ((data === "\x1b[D" || data === "\x7f") && index > 0) { done(BACK); return; }
				list.handleInput(data);
				tui.requestRender();
			},
		};
	});
}

// --- Checkbox ----------------------------------------------------------------

async function askCheckbox(
	ctx: ExtensionContext,
	q: CheckboxQuestion,
	index: number,
	total: number,
): Promise<string[] | Back | undefined> {
	const rawOptions = q.allowOther ? [...q.options, "Other..."] : q.options;
	const items: SettingItem[] = rawOptions.map((o) => ({
		id:           o === "Other..." ? OTHER_SENTINEL : o,
		label:        o,
		currentValue: "off",
		values:       ["on", "off"],
	}));

	const selected = new Set<string>();

	const result = await ctx.ui.custom<"confirmed" | Back | undefined>((tui, theme, _kb, done) => {
		const container = new Container();
		container.addChild(new DynamicBorder((s) => theme.fg("accent", s)));
		if (total > 1) container.addChild(new Text(theme.fg("dim", progress(index + 1, total)), 1, 0));
		container.addChild(new Text(theme.fg("accent", theme.bold(q.question)), 1, 0));
		container.addChild(new Spacer(1));

		const list = new SettingsList(
			items,
			Math.min(items.length + 2, 15),
			getSettingsListTheme(),
			(_id, newValue) => {
				if (newValue === "on") selected.add(_id);
				else selected.delete(_id);
			},
			() => done(undefined),
			{ enableSearch: false },
		);

		const orig = list.handleInput?.bind(list);
		container.addChild(list);
		container.addChild(new Spacer(1));
		container.addChild(new Text(theme.fg("dim", hint("checkbox", index)), 1, 0));
		container.addChild(new DynamicBorder((s) => theme.fg("accent", s)));

		return {
			render:      (w) => container.render(w),
			invalidate:  ()  => container.invalidate(),
			handleInput: (data) => {
				if (data === "\r" || data === "\n") { done("confirmed"); return; }
				if ((data === "\x1b[D" || data === "\x7f") && index > 0) { done(BACK); return; }
				orig?.(data);
				tui.requestRender();
			},
		};
	});

	if (result === undefined) return undefined;
	if (result === BACK)      return BACK;
	return Array.from(selected);
}

// --- Input -------------------------------------------------------------------

async function askInput(
	ctx: ExtensionContext,
	q: InputQuestion,
	index: number,
	total: number,
): Promise<string | Back | undefined> {
	return ctx.ui.custom<string | Back | undefined>((tui, theme, _kb, done) => {
		const container = new Container();
		container.addChild(new DynamicBorder((s) => theme.fg("accent", s)));
		if (total > 1) container.addChild(new Text(theme.fg("dim", progress(index + 1, total)), 1, 0));
		container.addChild(new Text(theme.fg("accent", theme.bold(q.question)), 1, 0));
		container.addChild(new Spacer(1));

		// Input: onSubmit/onEscape are public properties, not constructor options
		const input = new Input({ placeholder: q.placeholder ?? "" });
		input.onSubmit = (value) => {
			const t = value.trim();
			if (!t) { done(BACK); return; }
			done(t);
		};
		input.onEscape = () => done(undefined);

		container.addChild(input);
		container.addChild(new Spacer(1));
		container.addChild(new Text(theme.fg("dim", hint("input", index)), 1, 0));
		container.addChild(new DynamicBorder((s) => theme.fg("accent", s)));

		return {
			render:      (w) => container.render(w),
			invalidate:  ()  => container.invalidate(),
			handleInput: (data) => {
				if ((data === "\x1b[D" || data === "\x7f") && index > 0) { done(BACK); return; }
				input.handleInput?.(data);
				tui.requestRender();
			},
		};
	});
}

// --- Other free-text ---------------------------------------------------------

async function askOtherText(
	ctx: ExtensionContext,
	forQuestion: string,
): Promise<string | Back | undefined> {
	return ctx.ui.custom<string | Back | undefined>((tui, theme, _kb, done) => {
		const container = new Container();
		container.addChild(new DynamicBorder((s) => theme.fg("accent", s)));
		container.addChild(new Text(theme.fg("muted", `Other - ${forQuestion}`), 1, 0));
		container.addChild(new Spacer(1));

		// Input: onSubmit/onEscape are public properties, not constructor options
		const input = new Input({ placeholder: "Enter your answer..." });
		input.onSubmit = (v) => {
			const trimmed = v.trim();
			if (!trimmed) { done(BACK); return; }  // empty enter = back to choices
			done(trimmed);
		};
		input.onEscape = () => done(BACK);  // Esc = back to choices, not cancel form

		container.addChild(input);
		container.addChild(new Spacer(1));
		container.addChild(new Text(theme.fg("dim", "type answer  |  enter confirm  |  empty enter / esc  <- back"), 1, 0));
		container.addChild(new DynamicBorder((s) => theme.fg("accent", s)));

		return {
			render:      (w) => container.render(w),
			invalidate:  ()  => container.invalidate(),
			handleInput: (data) => { input.handleInput?.(data); tui.requestRender(); },
		};
	});
}

// --- Main entry point --------------------------------------------------------

export async function ask(
	ctx: ExtensionContext,
	questions: Question[],
	_options?: ChoicesOptions,
): Promise<Answers | undefined> {
	const answers: Answers = {};
	const total = questions.length;

	let i = 0;
	while (i < questions.length) {
		const q = questions[i];

		if (q.type === "radio") {
			let value = await askRadio(ctx, q, i, total);
			if (value === undefined)  return undefined;
			if (value === BACK)       { i--; continue; }
			if (value === OTHER_SENTINEL) {
				const other = await askOtherText(ctx, q.question);
				if (other === undefined) return undefined;
				if (other === BACK)      continue;
				value = other;
			}
			answers[q.id] = value;

		} else if (q.type === "checkbox") {
			let values = await askCheckbox(ctx, q, i, total);
			if (values === undefined) return undefined;
			if (values === BACK)      { i--; continue; }
			if (values.includes(OTHER_SENTINEL)) {
				const other = await askOtherText(ctx, q.question);
				if (other === undefined) return undefined;
				if (other === BACK)      continue;
				values = [...values.filter((v) => v !== OTHER_SENTINEL), other];
			}
			answers[q.id] = values;

		} else {
			const value = await askInput(ctx, q, i, total);
			if (value === undefined) return undefined;
			if (value === BACK)      { i--; continue; }
			answers[q.id] = value;
		}

		i++;
	}

	return answers;
}
