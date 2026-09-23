import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { DynamicBorder, getSettingsListTheme } from "@earendil-works/pi-coding-agent";
import { Container, Input, SelectList, SettingsList, Spacer, Text, type SelectItem, type SettingItem } from "@earendil-works/pi-tui";

// ─── Public types ────────────────────────────────────────────────────────────

export type RadioQuestion = {
	type: "radio";
	id: string;
	question: string;
	options: string[];
	/** Add a free-text "Other…" option at the end */
	allowOther?: boolean;
};

export type CheckboxQuestion = {
	type: "checkbox";
	id: string;
	question: string;
	options: string[];
	/** Add a free-text "Other…" option at the end */
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
	/** Show all questions at once instead of one at a time. Default: false */
	batch?: boolean;
	/** Title shown at the top of the form */
	title?: string;
};

// ─── Bridge ──────────────────────────────────────────────────────────────────

export type ChoicesBridge = {
	ask(ctx: ExtensionContext, questions: Question[], options?: ChoicesOptions): Promise<Answers | undefined>;
};

export const CHOICES_BRIDGE_KEY = Symbol.for("pi-choices.bridge.v1");

// ─── Helpers ─────────────────────────────────────────────────────────────────

const OTHER_SENTINEL = "__other__";

function progress(current: number, total: number): string {
	return `Question ${current} / ${total}`;
}

function hint(type: Question["type"]): string {
	if (type === "radio") return "↑↓ navigate  •  enter select  •  esc cancel";
	if (type === "checkbox") return "↑↓ navigate  •  space toggle  •  enter confirm  •  esc cancel";
	return "type answer  •  enter confirm  •  esc cancel";
}

// ─── Radio question ───────────────────────────────────────────────────────────

async function askRadio(
	ctx: ExtensionContext,
	q: RadioQuestion,
	index: number,
	total: number,
): Promise<string | undefined> {
	const rawOptions = q.allowOther ? [...q.options, "Other…"] : q.options;
	const items: SelectItem[] = rawOptions.map((o) => ({ value: o === "Other…" ? OTHER_SENTINEL : o, label: o }));

	return ctx.ui.custom<string | undefined>((tui, theme, _kb, done) => {
		const container = new Container();
		container.addChild(new DynamicBorder((s) => theme.fg("accent", s)));
		if (total > 1) container.addChild(new Text(theme.fg("dim", progress(index + 1, total)), 1, 0));
		container.addChild(new Text(theme.fg("accent", theme.bold(q.question)), 1, 0));
		container.addChild(new Spacer(1));

		const list = new SelectList(items, Math.min(items.length, 10), {
			selectedPrefix: (t) => theme.fg("accent", t),
			selectedText: (t) => theme.fg("accent", t),
			description: (t) => theme.fg("muted", t),
			scrollInfo: (t) => theme.fg("dim", t),
			noMatch: (t) => theme.fg("warning", t),
		});
		list.onSelect = (item) => done(item.value);
		list.onCancel = () => done(undefined);
		container.addChild(list);

		container.addChild(new Spacer(1));
		container.addChild(new Text(theme.fg("dim", hint("radio")), 1, 0));
		container.addChild(new DynamicBorder((s) => theme.fg("accent", s)));

		return {
			render: (w) => container.render(w),
			invalidate: () => container.invalidate(),
			handleInput: (data) => { list.handleInput(data); tui.requestRender(); },
		};
	});
}

// ─── Checkbox question ────────────────────────────────────────────────────────

async function askCheckbox(
	ctx: ExtensionContext,
	q: CheckboxQuestion,
	index: number,
	total: number,
): Promise<string[] | undefined> {
	const rawOptions = q.allowOther ? [...q.options, "Other…"] : q.options;
	const items: SettingItem[] = rawOptions.map((o) => ({
		id: o === "Other…" ? OTHER_SENTINEL : o,
		label: o,
		currentValue: "off",
		values: ["on", "off"],
	}));

	const selected = new Set<string>();

	const result = await ctx.ui.custom<"confirmed" | undefined>((tui, theme, _kb, done) => {
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
				const id = _id;
				if (newValue === "on") selected.add(id);
				else selected.delete(id);
			},
			() => done(undefined),
			{ enableSearch: false },
		);

		// Override enter key to confirm instead of close
		const origHandleInput = list.handleInput?.bind(list);
		const wrappedHandleInput = (data: string) => {
			if (data === "\r" || data === "\n") {
				done("confirmed");
				return;
			}
			origHandleInput?.(data);
			tui.requestRender();
		};

		container.addChild(list);
		container.addChild(new Spacer(1));
		container.addChild(new Text(theme.fg("dim", hint("checkbox")), 1, 0));
		container.addChild(new DynamicBorder((s) => theme.fg("accent", s)));

		return {
			render: (w) => container.render(w),
			invalidate: () => container.invalidate(),
			handleInput: wrappedHandleInput,
		};
	});

	if (result === undefined) return undefined;
	return Array.from(selected);
}

// ─── Input question ───────────────────────────────────────────────────────────

async function askInput(
	ctx: ExtensionContext,
	q: InputQuestion,
	index: number,
	total: number,
): Promise<string | undefined> {
	return ctx.ui.custom<string | undefined>((tui, theme, _kb, done) => {
		const container = new Container();
		container.addChild(new DynamicBorder((s) => theme.fg("accent", s)));
		if (total > 1) container.addChild(new Text(theme.fg("dim", progress(index + 1, total)), 1, 0));
		container.addChild(new Text(theme.fg("accent", theme.bold(q.question)), 1, 0));
		container.addChild(new Spacer(1));

		const input = new Input({
			placeholder: q.placeholder ?? "",
			onSubmit: (value) => done(value.trim() || undefined),
			onCancel: () => done(undefined),
		});
		container.addChild(input);
		container.addChild(new Spacer(1));
		container.addChild(new Text(theme.fg("dim", hint("input")), 1, 0));
		container.addChild(new DynamicBorder((s) => theme.fg("accent", s)));

		return {
			render: (w) => container.render(w),
			invalidate: () => container.invalidate(),
			handleInput: (data) => { input.handleInput?.(data); tui.requestRender(); },
		};
	});
}

// ─── "Other" free-text follow-up ─────────────────────────────────────────────

async function askOtherText(ctx: ExtensionContext, forQuestion: string): Promise<string | undefined> {
	return ctx.ui.custom<string | undefined>((tui, theme, _kb, done) => {
		const container = new Container();
		container.addChild(new DynamicBorder((s) => theme.fg("accent", s)));
		container.addChild(new Text(theme.fg("muted", `Other — ${forQuestion}`), 1, 0));
		container.addChild(new Spacer(1));
		const input = new Input({
			placeholder: "Enter your answer…",
			onSubmit: (v) => done(v.trim() || undefined),
			onCancel: () => done(undefined),
		});
		container.addChild(input);
		container.addChild(new Spacer(1));
		container.addChild(new Text(theme.fg("dim", "type answer  •  enter confirm  •  esc cancel"), 1, 0));
		container.addChild(new DynamicBorder((s) => theme.fg("accent", s)));
		return {
			render: (w) => container.render(w),
			invalidate: () => container.invalidate(),
			handleInput: (data) => { input.handleInput?.(data); tui.requestRender(); },
		};
	});
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export async function ask(
	ctx: ExtensionContext,
	questions: Question[],
	_options?: ChoicesOptions,
): Promise<Answers | undefined> {
	const answers: Answers = {};
	const total = questions.length;

	for (let i = 0; i < questions.length; i++) {
		const q = questions[i];

		if (q.type === "radio") {
			let value = await askRadio(ctx, q, i, total);
			if (value === undefined) return undefined;
			if (value === OTHER_SENTINEL) {
				const other = await askOtherText(ctx, q.question);
				if (other === undefined) return undefined;
				value = other;
			}
			answers[q.id] = value;
		} else if (q.type === "checkbox") {
			let values = await askCheckbox(ctx, q, i, total);
			if (values === undefined) return undefined;
			if (values.includes(OTHER_SENTINEL)) {
				const other = await askOtherText(ctx, q.question);
				if (other === undefined) return undefined;
				values = [...values.filter((v) => v !== OTHER_SENTINEL), other];
			}
			answers[q.id] = values;
		} else {
			const value = await askInput(ctx, q, i, total);
			if (value === undefined) return undefined;
			answers[q.id] = value;
		}
	}

	return answers;
}
