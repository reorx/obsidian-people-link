import { App, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { getAPI } from 'obsidian-dataview';
import PeopleSuggest from 'suggest';


interface PeopleLinkPluginSettings {
	triggerPrefix: string;
	dataviewSource: string;
	suggestionsLimit: number;
	createPersonIfNotExists: boolean;
	newPersonLocation: string;
	openNewPersonInSplitPane: boolean;
}

const DEFAULT_SETTINGS: PeopleLinkPluginSettings = {
	triggerPrefix: '@',
	dataviewSource: '"People"',
	suggestionsLimit: 5,
	createPersonIfNotExists: true,
	newPersonLocation: 'People',
	openNewPersonInSplitPane: true,
}

export default class PeopleLinkPlugin extends Plugin {
	settings: PeopleLinkPluginSettings;
	peopleSuggest: PeopleSuggest;

	async onload() {
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		const pkg = require('./manifest.json')
		console.log(`Plugin loading: ${pkg.id} ${pkg.version} BUILD_ENV=${process.env.BUILD_ENV}`)

		await this.loadSettings();

		this.peopleSuggest = new PeopleSuggest(this.app, this)
		this.registerEditorSuggest(this.peopleSuggest);

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new PeopleLinkSettingTab(this.app, this));
	}

	onunload() {
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}


class PeopleLinkSettingTab extends PluginSettingTab {
	plugin: PeopleLinkPlugin;

	constructor(app: App, plugin: PeopleLinkPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		const warnings = []
		if (!getAPI()) {
			warnings.push(`To ensure proper functionality, you must install <a href="https://github.com/blacksmithgu/obsidian-dataview">Obsidian Dataview</a> alongside this plugin.`)
		}
		const nldatesPlugin = this.app.plugins.plugins['nldates-obsidian']
		if (nldatesPlugin?.settings.autocompleteTriggerPhrase === this.plugin.settings.triggerPrefix) {
			warnings.push(`Trigger prefix ${this.plugin.settings.triggerPrefix} is conflict with <a href="https://github.com/argenos/nldates-obsidian">Natural Language Dates</a>. Please change one of them, or disable the autosuggest feature in that plugin.`)
		}
		if (warnings.length) {
			containerEl.createEl('div').innerHTML = `
			<div style="color: var(--color-red); font-size: 1.2em; border: 1px solid var(--color-red); padding: 1em; padding-bottom: 0; margin: 0.5em 0 1.5em">
				<b>Warnings</b>
				<ul style="padding-left: 1em;">
					${warnings.map(warning => `<li style="margin-bottom: .5em;">${warning}</li>`).join('')}
				</ul>
			</div>`;
		}

		containerEl.createEl('h2', {text: 'People Link Settings'});

		new Setting(containerEl)
			.setName('Trigger Prefix')
			.setDesc('Character(s) that will cause the people autosuggest to open')
			.addText(text => text
				.setValue(this.plugin.settings.triggerPrefix)
				.onChange(async (value) => {
					this.plugin.settings.triggerPrefix = value;
					await this.plugin.saveSettings();
				}));

		const dataviewSetting = new Setting(containerEl)
			.setName('Dataview Source')
			.setDesc(`The dataview source is used to identify notes for people. It can be folders, tags, files, or a combination of them. Check more information at Dataview docs: `);
		dataviewSetting.descEl.createEl('a', {
			text: 'Sources',
			attr: {
				href: 'https://blacksmithgu.github.io/obsidian-dataview/reference/sources/'
			}
		})
		dataviewSetting
			.addText(text => text
				.setValue(this.plugin.settings.dataviewSource)
				.onChange(async (value) => {
					this.plugin.settings.dataviewSource = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Suggestions Limit')
			.setDesc(`The maximum number of suggestions to show.`)
			.addText(text => {
				text
					.setValue(this.plugin.settings.suggestionsLimit.toString())
					.onChange(async (value) => {
						this.plugin.settings.suggestionsLimit = parseInt(value);
						await this.plugin.saveSettings();
					});
				text.inputEl.setAttribute('type', 'number');
			})

		new Setting(containerEl)
			.setName('Create person if not exists')
			.setDesc(`Create a person when press enter if one doesn't already exist.`)
			.addToggle(text => text
				.setValue(this.plugin.settings.createPersonIfNotExists)
				.onChange(async (value) => {
					this.plugin.settings.createPersonIfNotExists = value
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('New person location')
			.setDesc(`New person will be created at this folder location.`)
			.addText(text => text
				.setValue(this.plugin.settings.newPersonLocation)
				.onChange(async (value) => {
					this.plugin.settings.newPersonLocation = value
					this.plugin.peopleSuggest.setSuggestionsCacheValidity(false)
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Open new person in split pane')
			.setDesc(`If disabled, new person will be opened in a new tab.`)
			.addToggle(text => text
				.setValue(this.plugin.settings.openNewPersonInSplitPane)
				.onChange(async (value) => {
					this.plugin.settings.openNewPersonInSplitPane = value
					await this.plugin.saveSettings();
				}));
	}
}
