import Fuse from 'fuse.js';
import { DataviewErrorModal } from 'modal';
import {
  App, Editor, EditorPosition, EditorSuggest, EditorSuggestContext, EditorSuggestTriggerInfo,
  MarkdownView, TFile,
} from 'obsidian';
import { DataviewApi, getAPI } from 'obsidian-dataview';
import {
  createFile, generateLinkFromName, openFile, NewPaneDirection, FileViewMode, logger,
} from 'utils';

import type PeopleLinkPluginSettings from './main';


interface PersonSuggestion {
	label: string;
	file?: TFile;
	dataviewError?: boolean;
}

interface DataArrayItem {
	file: TFile
}

const fuseThreshold = 0.3

export default class PeopleSuggest extends EditorSuggest<PersonSuggestion> {
	private plugin: PeopleLinkPluginSettings;
	private app: App;
	private dv: DataviewApi|undefined;
	private suggestionsCache: PersonSuggestion[];
	private suggestionsCacheIsVaild: boolean;

	constructor(app: App, plugin: PeopleLinkPluginSettings) {
		super(app);
		this.app = app;
		this.plugin = plugin;
		this.suggestionsCache = [];

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

	getSuggestions(context: EditorSuggestContext): PersonSuggestion[] {
		const dv = this.getDataviewAPI()
		logger.debug('getSuggestions', context)
		if (!dv) return [{
			label: 'Error: cannot get Dataview plugin',
			dataviewError: true,
		}]

		const {suggestionsLimit} = this.plugin.settings

		// check suggestions cache validity
		if (!this.suggestionsCacheIsVaild) {
			this.updateSuggestionsCache()
		}

		const {query} = context
		if (!query) {
			return this.suggestionsCache.slice(0, suggestionsLimit)
		}

		// create fuse
		const fuse = new Fuse(this.suggestionsCache, {
			includeScore: true,
			keys: ['label'],
			threshold: fuseThreshold,
		})

		const fuseResult = fuse.search(query, {
			limit: 5,
		})
		logger.debug('fuse result', fuseResult, fuseThreshold)

		const suggestions: PersonSuggestion[] = []
		let hasExactMatch = false
		for (const item of fuseResult) {
			// filter out score smaller than threshold because fuse.js somehow not guarantee that
			const score = item.score || 1
			if (score > fuseThreshold) {
				continue
			}
			// exact match is case sensitive
			if (item.item.label === query) {
				hasExactMatch = true
				suggestions.unshift(item.item)
			} else {
				suggestions.push(item.item)
			}
		}
		logger.debug('suggestions', suggestions)

		// add default suggestion if there is no result or no exact match
		const defaultSuggestion = {
			label: context.query,
		}
		if (suggestions.length === 0 || !hasExactMatch) {
			suggestions.push(defaultSuggestion)
		}
		return suggestions
	}

	getDataviewAPI(): DataviewApi|undefined {
		if (!this.dv) {
			this.dv = getAPI(this.app);
			if (this.dv) {
				// listen to dataview event on metadata cache
				this.plugin.registerEvent(
					this.app.metadataCache.on('dataview:metadata-change', (op, file, oldFile?) => {
						if (op === 'rename' || op === 'delete') {
							logger.debug('dataview:metadata-change rename|delete', op, file, oldFile)
							this.setSuggestionsCacheValidity(false)
						}
					})
				)
			}
		}
		return this.dv;
	}

	updateSuggestionsCache() {
		const {dataviewSource} = this.plugin.settings

		const cache: PersonSuggestion[] = []
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		this.dv!.pages(dataviewSource).sort(o => o.file.mtime, 'desc').forEach(page => {
			cache.push(pageToSuggestion(page as DataArrayItem))
		})
		logger.debug('updateSuggestionsCache', cache)
		this.suggestionsCache = cache
		this.setSuggestionsCacheValidity(true)
	}

	setSuggestionsCacheValidity(flag: boolean) {
		logger.debug('setSuggestionsCacheValidity', flag)
		this.suggestionsCacheIsVaild = flag
	}

	renderSuggestion(suggestion: PersonSuggestion, el: HTMLElement): void {
		if (suggestion.dataviewError) {
			el.innerHTML = `<span style="color: var(--color-red);">${suggestion.label}</span><br><span>Enter to show more instructions</span>`
		} else if (suggestion.file) {
			el.setText(suggestion.label);
		} else {
			el.innerHTML = `<span style="color: var(--color-base-40);">${suggestion.label}</span><span>&nbsp;(new)</span>`
		}
	}

	selectSuggestion(suggestion: PersonSuggestion, event: KeyboardEvent | MouseEvent): void {
		logger.debug('selectSuggestion', event)
		if (suggestion.dataviewError) {
			new DataviewErrorModal(this.app).open()
			return
		}
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
					// so we manually invalidate suggestions cache here
					this.setSuggestionsCacheValidity(false)
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
		const startPos = findStartPos(cursor, editor, triggerPrefix, this.context)
		if (!startPos) {
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

function pageToSuggestion(page: DataArrayItem): PersonSuggestion {
	return {
		label: page.file.name,
		file: page.file,
	}
}

function findStartPos(cursor: EditorPosition, editor: Editor, triggerPrefix: string, context: EditorSuggestContext|null): EditorPosition|undefined {
	let startPos = context?.start
	if (startPos) {
		if (editor.getRange(startPos, cursor).startsWith(triggerPrefix)) {
			return startPos
		} else {
			return
		}
	} else {
		startPos = {
			line: cursor.line,
			ch: cursor.ch - triggerPrefix.length,
		}
		if (editor.getRange(startPos, cursor).startsWith(triggerPrefix)) {
			return startPos;
		}
		// If no person is found but the user want to create a new person,
		// the first character `@` returns empty suggestion which ends the context,
		// in this case we need to search 1 more character to the left
		// to start the context again.
		startPos.ch -= 1
		if (startPos.ch >= 0 && editor.getRange(startPos, cursor).startsWith(triggerPrefix)) {
			return startPos;
		}
		return
	}
}
