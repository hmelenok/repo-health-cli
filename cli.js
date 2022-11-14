#!/usr/bin/env node
// eslint-disable-next-line import/extensions
import index from './index.js'
import meow from 'meow'


const cli = meow(`
	Usage
	  $ repo-health-cli [input]

	Options
	  --postfix  Lorem ipsum  [Default: rainbows]

	Examples
	  $ repo-health-cli
	  unicorns & rainbows
	  $ repo-health-cli ponies
	  ponies & rainbows
`, {
	flags: {
		postfix: {
			type: 'string',
			default: 'rainbows',
		},
	},
})

console.log(index(cli.input[0], cli.flags))
