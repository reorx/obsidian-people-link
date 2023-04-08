import {
  App, Editor, EditorPosition, EditorSuggest, EditorSuggestContext, EditorSuggestTriggerInfo,
  MarkdownView, TFile,
} from 'obsidian';

import type PeopleLinkPluginSettings from './main';


interface PeopleCompletion {
	label: string;
}

export default class PeopleSuggest extends EditorSuggest<PeopleCompletion> {
	private plugin: PeopleLinkPluginSettings;
	private app: App;

	constructor(app: App, plugin: PeopleLinkPluginSettings) {
		super(app);
		this.app = app;
		this.plugin = plugin;

		// @ts-ignore
		this.scope.register(["Shift"], "Enter", (evt: KeyboardEvent) => {
			// @ts-ignore
			this.suggestions.useSelectedItem(evt);
			return false;
		});
	}

	getSuggestions(context: EditorSuggestContext): PeopleCompletion[] {
		const suggestions = this.getPeopleSuggestions(context);
		if (suggestions.length) {
			return suggestions;
		}

		// catch-all if there are no matches
		return [{ label: context.query }];
	}

	getPeopleSuggestions(context: EditorSuggestContext): PeopleCompletion[] {
		return [
			{
				label: "Steve Jobs"
			},
			{
				label: "Bill Gates"
			}
		]
	}

	renderSuggestion(suggestion: PeopleCompletion, el: HTMLElement): void {
		el.setText(suggestion.label);
	}

	selectSuggestion(suggestion: PeopleCompletion, event: KeyboardEvent | MouseEvent): void {
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!activeView) {
			return;
		}

		const useRaw = event.shiftKey;

		let result = ''
		if (useRaw) {
			result = suggestion.label;
		} else {
			result = `[${suggestion.label}]()`
		}


		if (!this.context) {
			console.warn('selectSuggestion: no context, canno replace string')
			return
		}
		activeView.editor.replaceRange(result, this.context.start, this.context.end);
	}

	onTrigger(
		cursor: EditorPosition,
		editor: Editor,
		file: TFile
	): EditorSuggestTriggerInfo | null {
		const triggerPrefix = this.plugin.settings.triggerPrefix;
		const startPos = this.context?.start || {
			line: cursor.line,
			ch: cursor.ch - triggerPrefix.length,
		};

		if (!editor.getRange(startPos, cursor).startsWith(triggerPrefix)) {
			return null;
		}

		const precedingChar = editor.getRange(
			{
				line: startPos.line,
				ch: startPos.ch - 1,
			},
			startPos
		);

		// Short-circuit if `@` as a part of a word (e.g. part of an email address)
		if (precedingChar && /[`a-zA-Z0-9]/.test(precedingChar)) {
			return null;
		}

		return {
			start: startPos,
			end: cursor,
			query: editor.getRange(startPos, cursor).substring(triggerPrefix.length),
		};
	}
}
