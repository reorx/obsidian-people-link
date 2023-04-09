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

const fuseThreshold = 0.1

export default class PeopleSuggest extends EditorSuggest<PeopleCompletion> {
	private plugin: PeopleLinkPluginSettings;
	private app: App;
	private dv: DataviewApi|undefined;
	private completionsCache: PeopleCompletion[];
	private completionsCacheVaild: boolean;

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
		debugLog('getPeopleSuggestions', context.query)
		if (!dv) return []

		const {suggestionsLimit} = this.plugin.settings

		// check completions cache validity
		if (!this.completionsCacheVaild) {
			this.updateCompletionsCache()
		}

		const {query} = context
		if (!query) {
			return this.completionsCache.slice(0, suggestionsLimit)
		}

		// create fuse
		const fuse = new Fuse(this.completionsCache, {
			includeScore: true,
			keys: ['label'],
			threshold: fuseThreshold,
		})

		const fuseResult = fuse.search(query, {
			limit: 5,
		})
		debugLog('fuse result', fuseResult, fuseThreshold)
		// filter out score smaller than threshold because fuse.js somehow not guarantee that
		const result = fuseResult.filter(item => (item.score || 1) < fuseThreshold).map(item => item.item)
		debugLog('eventual result', result)
		return result
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
							this.validateCompletionsCache(false)
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
		this.validateCompletionsCache(true)
	}

	validateCompletionsCache(flag: boolean) {
		debugLog('set completeionsCacheValid', flag)
		this.completionsCacheVaild = flag
	}

	renderSuggestion(suggestion: PeopleCompletion, el: HTMLElement): void {
		el.setText(suggestion.label);
	}

	selectSuggestion(suggestion: PeopleCompletion, event: KeyboardEvent | MouseEvent): void {
		debugLog('selectSuggestion', event)
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
		const { createPersonIfNotExists, newPersonLocation, openNewPersonInSplitPane } = this.plugin.settings
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
					direction: openNewPersonInSplitPane ? NewPaneDirection.vertical : undefined,
					focus: true,
					mode: FileViewMode.default,
				}).then(() => {
					// create file via function won't trigger 'dataview:metadata-change' event,
					// so we manually invalidate completions cache here
					this.validateCompletionsCache(false)
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
		// console.log('PeopleSuggest.onTrigger', startPos, prompt, this.context)

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
