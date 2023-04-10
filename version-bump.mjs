import { readFileSync, writeFileSync } from 'fs';
import readline from 'readline';


const currentVersion = process.env.npm_package_version;

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

let newVersion
rl.question(`Input new version (current is ${currentVersion}): `, (value) => {
	newVersion = value
	console.log('inputed', value, newVersion)
	rl.close();

	// update version in package.json
	const packagejson = readFileSync("package.json", "utf8")
	writeFileSync("package.json", packagejson.replace(`"version": "${currentVersion}"`, `"version": "${newVersion}"`));

	// read minAppVersion from manifest.json and bump version to target version
	let manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
	const { minAppVersion } = manifest;
	manifest.version = newVersion;
	writeFileSync("manifest.json", JSON.stringify(manifest, null, "\t"));

	// update versions.json with target version and minAppVersion from manifest.json
	let versions = JSON.parse(readFileSync("versions.json", "utf8"));
	versions[newVersion] = minAppVersion;
	writeFileSync("versions.json", JSON.stringify(versions, null, "\t"));
});
