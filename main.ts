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
		const pkg = require('./package.json')
		console.log(`Plugin loading: ${pkg.name} ${pkg.version} BUILD_ENV=${process.env.BUILD_ENV}`)

		await this.loadSettings();

		this.peopleSuggest = new PeopleSuggest(this.app, this)
		this.registerEditorSuggest(this.peopleSuggest);

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SampleSettingTab(this.app, this));
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


class SampleSettingTab extends PluginSettingTab {
	plugin: PeopleLinkPlugin;

	constructor(app: App, plugin: PeopleLinkPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		if (!getAPI()) {
			containerEl.createEl('blockquote', {
				text: 'This plugin requires Dataview to be installed.'
			})
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
			.setDesc(`Create a person when press enter if one doesn't already exist. If you press Shift + Enter while this option is enabled, new person won't be created.`)
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
			.setDesc(`If disabled, new person will be opened in a new tab`)
			.addToggle(text => text
				.setValue(this.plugin.settings.openNewPersonInSplitPane)
				.onChange(async (value) => {
					this.plugin.settings.openNewPersonInSplitPane = value
					await this.plugin.saveSettings();
				}));
	}
}
