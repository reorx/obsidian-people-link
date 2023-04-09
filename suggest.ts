import Fuse from 'fuse.js';
import {
  App, Editor, EditorPosition, EditorSuggest, EditorSuggestContext, EditorSuggestTriggerInfo,
  MarkdownView, TFile,
} from 'obsidian';
import { DataviewApi, getAPI } from 'obsidian-dataview';
import { createLink, debugLog } from 'utils';

import type PeopleLinkPluginSettings from './main';


interface PeopleCompletion {
	label: string;
	file: TFile;
}

interface DataArrayItem {
	file: TFile
}

export default class PeopleSuggest extends EditorSuggest<PeopleCompletion> {
	private plugin: PeopleLinkPluginSettings;
	private app: App;
	private dv: DataviewApi|undefined;
	private completionsCache: PeopleCompletion[];
	private completionsCacheKey: string;

	constructor(app: App, plugin: PeopleLinkPluginSettings) {
		super(app);
		this.app = app;
		this.plugin = plugin;
		this.completionsCache = [];

		// if dataview is not loaded, this has no effect, but don't worry
		// because when suggestion is triggered, this will be called again
		this.getDataviewAPI()

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
		return [];
	}

	getPeopleSuggestions(context: EditorSuggestContext): PeopleCompletion[] {
		const dv = this.getDataviewAPI()
		debugLog('getPeopleSuggestions', context.query, dv)
		if (!dv) return []

		const {suggestionsLimit, dataviewSource} = this.plugin.settings

		// validate completions cache
		if (this.completionsCacheKey !== dataviewSource) {
			this.updateCompletionsCache()
		}

		const {query} = context
		if (!query) {
			return this.completionsCache.slice(0, suggestionsLimit)
		}

		// create fuse
		const fuse = new Fuse(this.completionsCache, {
			keys: ['label'],
		})

		const result = fuse.search(query, {
			limit: 5,
		})
		debugLog('fuse result', result)
		return result.map(item => item.item)
	}

	getDataviewAPI(): DataviewApi|undefined {
		if (!this.dv) {
			this.dv = getAPI(this.app);
			if (this.dv) {
				// init people files cache
				this.updateCompletionsCache()

				// listen to dataview event on metadata cache
				this.plugin.registerEvent(
					this.app.metadataCache.on('dataview:metadata-change', (op, file, oldFile?) => {
						if (op === 'rename' || op === 'delete') {
							debugLog('dataview:metadata-change rename|delete', op, file, oldFile)
							this.updateCompletionsCache()
						}
					})
				)
			}
		}
		return this.dv;
	}

	updateCompletionsCache() {
		const {dataviewSource} = this.plugin.settings

		const cache: PeopleCompletion[] = []
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		this.dv!.pages(dataviewSource).sort(o => o.file.ctime, 'desc').forEach(page => {
			cache.push(pageToCompletion(page as DataArrayItem))
		})
		debugLog('updateCompletionsCache', cache)
		this.completionsCache = cache
		this.completionsCacheKey = dataviewSource
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
			result = createLink(this.app, suggestion.file)
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
		let startPos = this.context?.start
		if (!startPos) {
			// findStartPos handles the case where context will be cancelled before the word is chosen from the CJK IME
			startPos = findStartPos(cursor, editor, triggerPrefix);
			if (!startPos) {
				return null;
			}
		}
		const prompt = editor.getRange(startPos, cursor)
		console.log('PeopleSuggest.onTrigger 0', startPos, prompt, this.context)

		if (!prompt.startsWith(triggerPrefix)) {
			return null;
		}

		const precedingChar = editor.getRange(
			{
				line: startPos.line,
				ch: startPos.ch - 1,
			},
			startPos
		);
		console.log('PeopleSuggest.onTrigger 1', prompt, precedingChar)

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

function pageToCompletion(page: DataArrayItem): PeopleCompletion {
	return {
		label: page.file.name,
		file: page.file,
	}
}

const triggerPrefixToCursorMaxDistance = 10

function findStartPos(cursor: EditorPosition, editor: Editor, triggerPrefix: string): EditorPosition|undefined {
	const line = editor.getLine(cursor.line);
	const textBeforeCursor = editor.getRange({line: cursor.line, ch: 0}, cursor);

	// find positions of triggerPrefix occurances in textBeforeCursor
	let pos = -1;
	const positions = [];
	while ((pos = textBeforeCursor.indexOf(triggerPrefix, pos + 1)) !== -1) {
		positions.push(pos);
	}
	if (positions.length === 0) return
	const startPosIndex = positions[positions.length - 1]

	const distance = cursor.ch - startPosIndex - triggerPrefix.length;
	if (distance > triggerPrefixToCursorMaxDistance) return

	return {
		line: cursor.line,
		ch: startPosIndex,
	};
}
