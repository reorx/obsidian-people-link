import { App, Plugin, PluginSettingTab, Setting } from 'obsidian';
import PeopleSuggest from 'suggest';


interface PeopleLinkPluginSettings {
	triggerPrefix: string;
}

const DEFAULT_SETTINGS: PeopleLinkPluginSettings = {
	triggerPrefix: '@'
}

export default class PeopleLinkPlugin extends Plugin {
	settings: PeopleLinkPluginSettings;

	async onload() {
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		const pkg = require('./package.json')
		console.log(`Plugin loading: ${pkg.name} ${pkg.version} BUILD_ENV=${process.env.BUILD_ENV}`)

		await this.loadSettings();

		this.registerEditorSuggest(new PeopleSuggest(this.app, this));

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

		containerEl.createEl('h2', {text: 'Settings for my awesome plugin.'});

		new Setting(containerEl)
			.setName('Trigger Prefix')
			.setDesc('Character(s) that will cause the people autosuggest to open')
			.addText(text => text
				.setPlaceholder('Enter your secret')
				.setValue(this.plugin.settings.triggerPrefix)
				.onChange(async (value) => {
					this.plugin.settings.triggerPrefix = value;
					await this.plugin.saveSettings();
				}));
	}
}
