import { App, TFile, normalizePath } from 'obsidian';


export const DEBUG = !(process.env.BUILD_ENV === 'production')
if (DEBUG) console.log('DEBUG is enabled')

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function debugLog(...args: any[]) {
	if (DEBUG) {
		console.log((new Date()).toISOString().slice(11, 23), ...args)
	}
}

// from https://github.com/argenos/nldates-obsidian/blob/e621a9609211174b964230f5bb890faa574fb7f1/src/utils.ts#L104
// TODO find a better way to do this
export function createLink(app: App, file: TFile, alias?: string) {
	const useMarkdownLinks = (app.vault as any).getConfig("useMarkdownLinks");
	const path = normalizePath(file.name);

	if (useMarkdownLinks) {
		if (alias) {
			return `[${alias}](${path.replace(/ /g, "%20")})`;
		} else {
			return `[${file.name}](${path})`;
		}
	} else {
		if (alias) {
			return `[[${path}|${alias}]]`;
		} else {
			return `[[${path}]]`;
		}
	}
}
