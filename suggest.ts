import Fuse from 'fuse.js';
import {
  App, Editor, EditorPosition, EditorSuggest, EditorSuggestContext, EditorSuggestTriggerInfo,
  MarkdownView, TFile,
} from 'obsidian';
import { DataviewApi, getAPI } from 'obsidian-dataview';
import {
  debugLog, createFile, generateLinkFromName, openFile, NewPaneDirection, FileViewMode,
} from 'utils';

import type PeopleLinkPluginSettings from './main';


interface PeopleCompletion {
	label: string;
	file?: TFile;
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

		return [{
			label: context.query,
		}];
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
			threshold: 0.3,
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
		if (!this.context) {
			console.warn('selectSuggestion: no context, cannot replace string')
			return
		}

		const replaceWithLabel = () => {
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			activeView.editor.replaceRange(suggestion.label, this.context!.start, this.context!.end);
		}

		const useRaw = event.shiftKey;
		if (useRaw) {
			return replaceWithLabel()
		}

		let linkText = ''
		const file = suggestion.file
		const { createPersonIfNotExists, newPersonLocation } = this.plugin.settings
		if (file) {
			linkText = generateLinkFromName(this.app, file.name)
		} else {
			if (!createPersonIfNotExists) {
				return replaceWithLabel()
			}
			// async
			createFile(newPersonLocation, suggestion.label).then(file => {
				if (!file) return
				// open in new split pane
				openFile(this.app, file, {
					openInNewPane: true,
					direction: NewPaneDirection.vertical,
					focus: true,
					mode: FileViewMode.default,
				})
			})
			linkText = generateLinkFromName(this.app, suggestion.label)
		}
		activeView.editor.replaceRange(linkText, this.context.start, this.context.end);
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
		}
		const prompt = editor.getRange(startPos, cursor)
		// console.log('PeopleSuggest.onTrigger 0', startPos, prompt, this.context)

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
		// console.log('PeopleSuggest.onTrigger 1', prompt, precedingChar)

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
