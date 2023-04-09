import {
  App, Notice, TFile, Vault, WorkspaceLeaf, ViewState, normalizePath,
} from 'obsidian';
import { getNotePath } from 'vault';


export const DEBUG = !(process.env.BUILD_ENV === 'production')
if (DEBUG) console.log('DEBUG is enabled')

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function debugLog(...args: any[]) {
	if (DEBUG) {
		console.log((new Date()).toISOString().slice(11, 23), ...args)
	}
}


// from: https://github.com/reorx/obsidian-paste-image-rename/blob/c187bf6ffc897da793eba930f9578710795460ec/src/utils.ts#L113-L124
interface VaultConfig {
	useMarkdownLinks?: boolean
}

interface VaultWithConfig extends Vault {
	config?: VaultConfig,
}

export function getVaultConfig(app: App): VaultConfig|undefined {
	const vault = app.vault as VaultWithConfig
	return vault.config
}


// from https://github.com/argenos/nldates-obsidian/blob/e621a9609211174b964230f5bb890faa574fb7f1/src/utils.ts#L104
// TODO find a better way to do this
export function generateLinkFromName(app: App, filename: string, alias?: string) {
	const useMarkdownLinks = (app.vault as VaultWithConfig).config?.useMarkdownLinks
	const path = normalizePath(filename);

	if (useMarkdownLinks) {
		if (alias) {
			return `[${alias}](${path.replace(/ /g, "%20")})`;
		} else {
			return `[${filename}](${path})`;
		}
	} else {
		if (alias) {
			return `[[${path}|${alias}]]`;
		} else {
			return `[[${path}]]`;
		}
	}
}

export async function createFile(folder: string, filename: string): Promise<TFile|undefined> {
	const app = window.app as App;
	const { vault } = app;

	const normalizedPath = await getNotePath(folder, filename);

	try {
		const createdFile = await vault.create(normalizedPath, '');
		return createdFile;
	} catch (err) {
		console.error(`Failed to create file: '${normalizedPath}'`, err);
		new Notice(`Unable to create new file ${normalizedPath}: ${err}`);
	}
}

export enum FileViewMode {
	source = 'source', preview = 'preview', default = 'default'
}

export enum NewPaneDirection {
	vertical = 'vertical', horizontal = 'horizontal'
}

export async function openFile(app: App, file: TFile, optional?: {openInNewPane?: boolean, direction?: NewPaneDirection, mode?: FileViewMode, focus?: boolean}): Promise<WorkspaceLeaf> {
	let leaf: WorkspaceLeaf

	if (optional?.openInNewPane && optional?.direction) {
		leaf = app.workspace.getLeaf('split', optional.direction)
	} else {
		leaf = app.workspace.getLeaf('tab')
	}

	await leaf.openFile(file)

	if (optional?.mode || optional?.focus) {
		const viewState = leaf.getViewState()
		await leaf.setViewState({
			...viewState,
			state: optional.mode && optional.mode !== 'default'
				? {
					...viewState.state,
					mode: optional.mode,
				}
				: viewState.state,
			popstate: true,
		} as ViewState, { focus: optional?.focus })
	}
	return leaf
}
