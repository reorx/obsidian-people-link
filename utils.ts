import { App, TFile } from 'obsidian';


export function createLink(app: App, file: TFile, sourcePath: string) {
	const linkText = app.fileManager.generateMarkdownLink(file, sourcePath)
	return linkText
}
