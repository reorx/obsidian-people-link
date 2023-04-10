import { App, Modal } from 'obsidian';


export class DataviewErrorModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		const {contentEl} = this;
		contentEl.createEl('h2', {
			text: 'People Link Error'
		})
		contentEl.createEl('div').innerHTML = `
		<p>
			To ensure proper functionality, you must install <a href="obsidian://show-plugin?id=dataview">Obsidian Dataview</a> alongside this plugin.
		</p>
		`
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}
}
