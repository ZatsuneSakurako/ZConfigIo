import fs from 'node:fs';
import path from 'node:path';
import console from "node:console";
import process from "node:process";
import {Static, TSchema} from "typebox";
import {Compile, Validator} from "typebox/compile";
import * as confBox from "confbox";

export class ZConfigIo<T extends TSchema> {
	#watcher: fs.FSWatcher|null;
	readonly #filePath: string;
	readonly #fileExtension: string;
	#data: Static<T>|undefined;
	readonly #configValueFactory: () => Static<T>;
	readonly #schemaCompiled: Validator<{}, T>;
	constructor(fileName: string, schema: T, configValueFactory:() => NonNullable<Static<T>>, autoStart:boolean=true) {
		this.#filePath = path.isAbsolute(fileName) ? fileName : path.normalize(`${process.cwd()}/${fileName}`);
		this.#fileExtension = path.extname(fileName).replace(/^./, '');

		this.#configValueFactory = configValueFactory;
		this.#data = undefined;
		this.#schemaCompiled = Compile(schema);

		this.#readFile();
		this.#watcher = null;
		if (autoStart) {
			this.start();
		}
	}


	get data(): Static<T> {
		return this.#data ?? this.#readFile();
	}
	set data(value: Static<T>) {
		this.#writeFile(value);
		this.#data = value;
	}


	start() {
		if (this.#watcher) {
			process.env.ZCONFIG_IO_DEBUG && console.warn(`Warning: toml already init (${JSON.stringify(this.#filePath)}) !`);
			return;
		}

		this.#watcher = fs.watch(this.#filePath, (eventType: fs.WatchEventType, filename) => {
			process.env.ZCONFIG_IO_DEBUG && console.debug(`File ${filename} changed: ${eventType}`);
			this.#readFile();
		});
	}

	stop() {
		if (!this.#watcher) {
			console.warn(`Warning: toml already stopped (${JSON.stringify(this.#filePath)})`);
			return;
		}
		this.#watcher.close();
		this.#watcher = null;
	}


	#readFile(): Static<T> {
		if (!fs.existsSync(this.#filePath)) {
			const data = this.#data = this.#configValueFactory();
			this.#writeFile(data);
			return data;
		}

		// Read the updated file
		const rawData = fs.readFileSync(this.#filePath, "utf8");

		let data:unknown;
		switch (this.#fileExtension) {
			case "toml":
				data = confBox.parseTOML(rawData);
				break;
			case "yaml":
				data = confBox.parseYAML(rawData);
				break;
			case "ini":
				data = confBox.parseINI(rawData);
				break;
			case "json":
				data = confBox.parseJSON(rawData);
				break;
			case "json5":
				data = confBox.parseJSON5(rawData);
				break;
			default:
				throw new Error(`Unsupported extension: ${this.#fileExtension}`);
		}

		process.env.ZCONFIG_IO_DEBUG && console.debug('Updated content:', rawData, data);

		if (!this.#schemaCompiled.Check(data)) {
			throw new Error(`Unable to parse schema: ${JSON.stringify(data)}`);
		}
		return this.#data = data;
	}

	#writeFile(value: T) {
		let stringifiedContent:string;
		switch (this.#fileExtension) {
			case "toml":
				stringifiedContent = confBox.stringifyTOML(value).trim();
				break;
			case "yaml":
				stringifiedContent = confBox.stringifyYAML(value).trim();
				break;
			case "ini":
				stringifiedContent = confBox.stringifyINI(value).trim();
				break;
			case "json":
				stringifiedContent = confBox.stringifyJSON(value);
				break;
			case "json5":
				stringifiedContent = confBox.stringifyJSON5(value);
				break;
			default:
				throw new Error(`Unsupported extension: ${this.#fileExtension}`);
		}
		fs.writeFileSync(this.#filePath, stringifiedContent.trim(), "utf8");
	}
}
