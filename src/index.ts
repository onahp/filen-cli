import arg from "arg"
import FilenSDK from "@filen/sdk"
import path from "path"
import os from "os"
import { err, errorOccurred, out, prompt } from "./interface"
import { CloudPath } from "./cloudPath"
import { FS } from "./fs"
import { Autocompletion } from "./autocompletion"
import { Authentication } from "./auth"
import { version } from "./buildInfo"
import { Updater } from "./updater"
import { helpPage } from "./helpPage"
import { splitCommandSegments } from "./commands"

const args = arg({
	// arguments
	"--dev": Boolean,
	"--help": Boolean,
	"--root": String,
	"--delete-credentials": Boolean,
	"--verbose": Boolean,
	"--json": Boolean,
	"--quiet": Boolean,
	"--email": String,
	"--password": String,
	"--two-factor-code": String,
	"--no-autocomplete": String,

	// aliases
	"-h": "--help",
	"-r": "--root",
	"-v": "--verbose",
	"-q": "--quiet",
	"-e": "--email",
	"-p": "--password",
	"-c": "--two-factor-code"
})

/**
 * Whether the application is run in a development environment (set via the `--dev` flag).
 */
export const isDevelopment = args["--dev"] ?? false

if (args["--help"] || args["--verbose"]) {
	out(`Filen CLI ${version}`)
	if (isDevelopment) out("Running in development environment")
}

if (args["--help"]) {
	out(helpPage)
	process.exit()
}

// eslint-disable-next-line no-extra-semi
;(async () => {
	await new Updater().checkForUpdates(args["--verbose"] ?? false)

	const filen = new FilenSDK({
		metadataCache: true,
		tmpPath: path.join(os.tmpdir(), "filen-cli")
	})

	const authentication = new Authentication(filen, args["--verbose"] ?? false)
	if (args["--delete-credentials"]) await authentication.deleteStoredCredentials()
	await authentication.authenticate(args["--email"], args["--password"], args["--two-factor-code"])

	const quiet = args["--quiet"]!
	const formatJson = args["--json"]!

	const cloudRootPath = args["--root"] !== undefined ? new CloudPath([]).navigate(args["--root"]) : new CloudPath([])
	const fs = new FS(filen)
	if (!args["--no-autocomplete"]) Autocompletion.instance = new Autocompletion(filen, cloudRootPath)

	if (args["_"].length === 0) {
		let cloudWorkingPath: CloudPath = cloudRootPath
		// eslint-disable-next-line no-constant-condition
		while (true) {
			const command = await prompt(`${cloudWorkingPath.toString()} > `, true)
			if (command === "") continue
			const segments = splitCommandSegments(command)
			const cmd = segments[0]!.toLowerCase()
			const args = segments.splice(1)
			const result = await fs.executeCommand(cloudWorkingPath, cmd, args, formatJson, quiet)
			if (result.exit) break
			if (result.cloudWorkingPath !== undefined) {
				cloudWorkingPath = result.cloudWorkingPath
				if (Autocompletion.instance) Autocompletion.instance.cloudWorkingPath = result.cloudWorkingPath
			}
		}
	} else {
		const result = await fs.executeCommand(cloudRootPath, args["_"][0]!, args["_"].slice(1), formatJson, quiet)
		if (errorOccurred) process.exit(1)
		if (result.cloudWorkingPath !== undefined)
			err("To navigate in a stateful environment, please invoke the CLI without any arguments.")
	}
	process.exit()
})()
